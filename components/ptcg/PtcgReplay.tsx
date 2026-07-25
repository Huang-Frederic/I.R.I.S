'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type {
  PtcgAnalysisRow,
  PtcgCardRow,
  PtcgGameState,
  PtcgPokemonState,
  PtcgSnapshot,
  PtcgTurnIndex,
} from '@/lib/types';
import { eventLabel } from '@/lib/utils/ptcg-event-label';

interface Props {
  me: string;
  opponent: string;
  snapshots: PtcgSnapshot[];
  turns: PtcgTurnIndex[];
  cards: Record<string, PtcgCardRow>;
  analysis: Pick<PtcgAnalysisRow, 'verdict' | 'moments' | 'checklist'> | null;
}

const SEVERITY: Record<string, string> = {
  error: 'border-l-red',
  warning: 'border-l-amber-500',
  note: 'border-l-sky-500',
  good: 'border-l-emerald-500',
};

export default function PtcgReplay({ me, opponent, snapshots, turns, cards, analysis }: Props) {
  const t = useTranslations('ptcg');

  // The setup phase has no `Tour de X` line, so it gets no entry in `turns`.
  // Without a tab for it the opening hands and placements are unreachable.
  const setup = useMemo(
    () =>
      snapshots
        .map((s, i) => [s, i] as const)
        .filter(([s]) => s.turnNumber === 0)
        .map(([, i]) => i),
    [snapshots],
  );
  const allTurns = useMemo<PtcgTurnIndex[]>(
    () => (setup.length ? [{ number: 0, player: null, events: setup }, ...turns] : turns),
    [setup, turns],
  );

  // Open on the end of setup: both boards are placed and the opening hand is
  // visible. Opening on event 0 would show an empty table.
  const [cursor, setCursor] = useState(setup.length ? setup[setup.length - 1] : 0);

  const byLine = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const mo of analysis?.moments ?? []) {
      const i = snapshots.findIndex((s) => s.line === mo.line);
      if (i >= 0) m.set(i, [...(m.get(i) ?? []), mo.line]);
    }
    return m;
  }, [analysis, snapshots]);

  const step = useCallback(
    (d: number) => setCursor((c) => Math.min(snapshots.length - 1, Math.max(0, c + d))),
    [snapshots.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [step]);

  const snap = snapshots[cursor];
  const state = snap.state;
  const turn = allTurns.find((x) => x.number === snap.turnNumber) ?? allTurns[0];
  const turnMoments = (analysis?.moments ?? []).filter((m) =>
    turn.events.some((i) => snapshots[i].line === m.line),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Turn tabs -------------------------------------------------------- */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {allTurns.map((x) => {
          const flagged = x.events.some((i) => byLine.has(i));
          const mine = x.player === me;
          return (
            <button
              key={x.number}
              onClick={() => setCursor(x.events[0])}
              className={`border-border shrink-0 rounded-lg border px-3 py-1.5 text-xs whitespace-nowrap transition ${
                x.number === snap.turnNumber
                  ? 'bg-accent text-surface font-semibold'
                  : 'bg-surface hover:bg-surface-2 text-text-muted'
              }`}
            >
              {x.number === 0 ? t('setup') : `T${x.number} · ${mine ? t('you') : opponent}`}
              {flagged && <span className="ml-1.5">●</span>}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Board ---------------------------------------------------------- */}
        <div className="border-border bg-surface rounded-xl border p-4">
          <Side label={opponent} state={state} player={opponent} cards={cards} reversed />

          <p className="border-border text-text-muted my-3 border-y border-dashed py-2 text-center text-xs">
            {state.stadium
              ? t('stadium', { name: state.stadium.card.name, owner: state.stadium.owner })
              : t('noStadium')}
          </p>

          <Side label={t('you')} state={state} player={me} cards={cards} />

          <div className="border-border mt-4 border-t pt-3">
            <h3 className="text-text-muted mb-2 text-xs font-semibold tracking-wide uppercase">
              {t('yourHand', { count: state.players[me].hand.length })}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {state.players[me].hand.map((c, i) => (
                <CardArt key={`${c.id}-${i}`} card={cards[c.id]} name={c.name} small />
              ))}
            </div>
          </div>

          <div className="text-text-muted mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>{t('yourDiscard', { count: state.players[me].discard.length })}</span>
            <span>{t('opponentHand', { count: state.players[opponent].unknownHand })}</span>
            <span>
              {t('prizes', {
                me: state.players[me].prizesRemaining,
                opponent: state.players[opponent].prizesRemaining,
              })}
            </span>
          </div>
        </div>

        {/* Side panel ----------------------------------------------------- */}
        <aside className="flex flex-col gap-4">
          <div className="border-border bg-surface rounded-xl border">
            <h2 className="border-border text-text-muted border-b px-4 py-2.5 text-xs font-semibold tracking-wide uppercase">
              {t('turnLog')}
            </h2>
            <ol className="max-h-72 overflow-y-auto p-1.5">
              {turn.events.map((i) => (
                <li key={i}>
                  <button
                    onClick={() => setCursor(i)}
                    className={`flex w-full gap-2 rounded px-2 py-1 text-left text-xs transition ${
                      i === cursor ? 'bg-accent text-surface font-semibold' : 'hover:bg-surface-2'
                    } ${byLine.has(i) ? 'border-l-red border-l-2' : ''}`}
                  >
                    <span className="text-text-muted w-9 shrink-0 tabular-nums">
                      L{snapshots[i].line}
                    </span>
                    <span>{eventLabel(snapshots[i].event, me, opponent)}</span>
                  </button>
                </li>
              ))}
            </ol>
            <div className="border-border flex gap-2 border-t p-2">
              <button
                onClick={() => step(-1)}
                className="border-border bg-surface-2 hover:bg-surface flex-1 rounded-lg border py-1.5 text-sm"
                aria-label={t('previous')}
              >
                <ChevronLeft className="mx-auto h-4 w-4" aria-hidden />
              </button>
              <button
                onClick={() => step(1)}
                className="border-border bg-surface-2 hover:bg-surface flex-1 rounded-lg border py-1.5 text-sm"
                aria-label={t('next')}
              >
                <ChevronRight className="mx-auto h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="border-border bg-surface rounded-xl border">
            <h2 className="border-border text-text-muted border-b px-4 py-2.5 text-xs font-semibold tracking-wide uppercase">
              {t('turnAnalysis')}
            </h2>
            <div className="flex flex-col gap-2 p-3">
              {turnMoments.length === 0 ? (
                <p className="text-text-muted text-xs">{t('nothingThisTurn')}</p>
              ) : (
                turnMoments.map((m) => (
                  <article
                    key={`${m.line}-${m.title}`}
                    className={`bg-surface-2 rounded-r-lg border-l-2 px-3 py-2 ${SEVERITY[m.severity] ?? 'border-l-sky-500'}`}
                  >
                    <h3 className="text-sm font-semibold">{m.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed whitespace-pre-line">{m.body}</p>
                    <button
                      onClick={() => {
                        const i = snapshots.findIndex((s) => s.line === m.line);
                        if (i >= 0) setCursor(i);
                      }}
                      className="text-text-muted mt-1.5 text-[11px] underline"
                    >
                      L{m.line}
                    </button>
                  </article>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */

function Side({
  label,
  state,
  player,
  cards,
  reversed = false,
}: {
  label: string;
  state: PtcgGameState;
  player: string;
  cards: Record<string, PtcgCardRow>;
  reversed?: boolean;
}) {
  const p = state.players[player];
  const active = p.active ? (
    <CardArt card={cards[p.active.cardId]} name={p.active.name} pokemon={p.active} active />
  ) : null;
  const bench = (
    <div className="flex flex-wrap gap-1.5">
      {p.bench.map((k) => (
        <CardArt key={k.uid} card={cards[k.cardId]} name={k.name} pokemon={k} />
      ))}
    </div>
  );

  return (
    <div className="py-1">
      <h3 className="text-text-muted mb-1.5 text-xs font-semibold tracking-wide uppercase">
        {label}
      </h3>
      {reversed ? (
        <>
          {bench}
          <div className="mt-1.5">{active}</div>
        </>
      ) : (
        <>
          {active}
          <div className="mt-1.5">{bench}</div>
        </>
      )}
    </div>
  );
}

function CardArt({
  card,
  name,
  pokemon,
  active = false,
  small = false,
}: {
  card?: PtcgCardRow;
  name: string;
  pokemon?: PtcgPokemonState;
  active?: boolean;
  small?: boolean;
}) {
  const w = small ? 46 : 62;
  const h = Math.round(w * 1.4);
  const hp = card?.hp ?? null;
  const left = hp && pokemon ? Math.max(0, hp - pokemon.damage) : null;

  return (
    <div className="relative" style={{ width: w }} title={name}>
      {card?.image_url ? (
        <Image
          src={`${card.image_url}/low.webp`}
          alt={name}
          width={w}
          height={h}
          className={`rounded ${active ? 'ring-accent ring-2' : ''}`}
          unoptimized
        />
      ) : (
        <div
          className={`bg-surface-2 rounded ${active ? 'ring-accent ring-2' : ''}`}
          style={{ width: w, height: h }}
        />
      )}
      {pokemon && pokemon.damage > 0 && (
        <span className="bg-red absolute top-0.5 right-0.5 rounded-full px-1 text-[10px] font-bold text-white tabular-nums">
          {pokemon.damage}
        </span>
      )}
      {pokemon && pokemon.attached.length > 0 && (
        <span className="bg-surface-2 text-text absolute bottom-0.5 left-0.5 rounded-full px-1 text-[10px] font-bold">
          +{pokemon.attached.length}
        </span>
      )}
      {left !== null && hp !== null && (
        <div className="bg-surface-2 mt-0.5 h-0.5 overflow-hidden rounded">
          <div
            className={left / hp <= 0.34 ? 'bg-red h-full' : 'h-full bg-emerald-500'}
            style={{ width: `${(left / hp) * 100}%` }}
          />
        </div>
      )}
      <p className="text-text-muted mt-0.5 line-clamp-2 text-[10px] leading-tight">{name}</p>
    </div>
  );
}
