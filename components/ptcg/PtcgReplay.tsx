'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { inlineMarkup } from '@/lib/utils/inline-markup';
import { previewPosition } from '@/lib/utils/ptcg-preview-position';

interface Props {
  me: string;
  opponent: string;
  snapshots: PtcgSnapshot[];
  turns: PtcgTurnIndex[];
  cards: Record<string, PtcgCardRow>;
  analysis: Pick<PtcgAnalysisRow, 'verdict' | 'moments' | 'checklist'> | null;
}

const SEVERITY: Record<string, { bar: string; dot: string; text: string }> = {
  error: { bar: 'border-l-red', dot: 'bg-red', text: 'text-red' },
  warning: { bar: 'border-l-amber-500', dot: 'bg-amber-500', text: 'text-amber-500' },
  note: { bar: 'border-l-sky-500', dot: 'bg-sky-500', text: 'text-sky-500' },
  good: { bar: 'border-l-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-500' },
};
const tone = (s: string) => SEVERITY[s] ?? SEVERITY.note;

/** Enlarged card, big enough to read attack text at TCGdex's high resolution. */
const PREVIEW_W = 300;
const PREVIEW_H = Math.round(PREVIEW_W * 1.393);

export default function PtcgReplay({ me, opponent, snapshots, turns, cards, analysis }: Props) {
  const t = useTranslations('ptcg');

  // The setup phase has no `Tour de X` line, so it gets no entry in `turns`.
  // Without a segment for it the opening hands and placements are unreachable.
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

  const byEvent = useMemo(() => {
    const m = new Map<number, string>();
    for (const mo of analysis?.moments ?? []) {
      const i = snapshots.findIndex((s) => s.line === mo.line);
      // Worst severity wins when a single event carries several findings.
      if (i >= 0 && (mo.severity === 'error' || !m.has(i))) m.set(i, mo.severity);
    }
    return m;
  }, [analysis, snapshots]);

  const step = useCallback(
    (d: number) => setCursor((c) => Math.min(snapshots.length - 1, Math.max(0, c + d))),
    [snapshots.length],
  );

  const snap = snapshots[cursor];
  const state = snap.state;
  const turnAt = allTurns.findIndex((x) => x.number === snap.turnNumber);
  const turn = allTurns[turnAt >= 0 ? turnAt : 0];

  // Landing on a turn always shows its first event, so the board reads as the
  // state that turn started from rather than wherever the cursor happened to be.
  const goTurn = useCallback(
    (d: number) => {
      const next = allTurns[turnAt + d];
      if (next) setCursor(next.events[0]);
    },
    [allTurns, turnAt],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowUp') goTurn(-1);
      if (e.key === 'ArrowDown') goTurn(1);
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [step, goTurn]);

  const turnMoments = (analysis?.moments ?? []).filter((m) =>
    turn.events.some((i) => snapshots[i].line === m.line),
  );
  const heading =
    turn.number === 0
      ? t('setup')
      : t('turnHeading', { number: turn.number, player: turn.player === me ? t('you') : opponent });
  const posInTurn = turn.events.indexOf(cursor);

  /* Hover preview ---------------------------------------------------------- */
  const [preview, setPreview] = useState<{ card: PtcgCardRow; left: number; top: number } | null>(
    null,
  );
  const show = useCallback((card: PtcgCardRow | undefined, el: HTMLElement) => {
    if (!card?.image_url) return;
    const r = el.getBoundingClientRect();
    const { left, top } = previewPosition(
      { left: r.left, top: r.top, width: r.width, height: r.height },
      { width: PREVIEW_W, height: PREVIEW_H },
      { width: innerWidth, height: innerHeight },
    );
    setPreview({ card, left, top });
  }, []);
  const hide = useCallback(() => setPreview(null), []);
  // A preview anchored to viewport coordinates drifts away from its card as
  // soon as the page moves, so it is dismissed rather than recalculated.
  useEffect(() => {
    if (!preview) return;
    addEventListener('scroll', hide, true);
    return () => removeEventListener('scroll', hide, true);
  }, [preview, hide]);

  // The turn arrows live in the analysis column now, so the timeline has to
  // follow the cursor by itself — otherwise stepping past the visible turns
  // silently moves a control that is scrolled off screen.
  const strip = useRef<HTMLElement>(null);
  useEffect(() => {
    strip.current
      ?.querySelector('[aria-current="step"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [turn.number]);

  const board = { show, hide, cards };

  return (
    <div className="flex flex-col gap-3">
      {/* Whole-game timeline ---------------------------------------------- */}
      <nav ref={strip} aria-label={t('turnLog')} className="flex gap-1 overflow-x-auto pb-0.5">
        {allTurns.map((x) => {
          const worst = x.events.reduce<string | null>(
            (w, i) => (byEvent.get(i) === 'error' ? 'error' : (w ?? byEvent.get(i) ?? null)),
            null,
          );
          const current = x.number === turn.number;
          const label =
            x.number === 0
              ? t('setup')
              : t('turnHeading', {
                  number: x.number,
                  player: x.player === me ? t('you') : opponent,
                });
          return (
            <button
              key={x.number}
              onClick={() => setCursor(x.events[0])}
              title={label}
              aria-label={label}
              // Only the current step carries the attribute — rendering
              // aria-current="false" on the other eleven says nothing and is
              // read out by some screen readers.
              aria-current={current ? 'step' : undefined}
              className={`min-w-12 flex-1 shrink-0 rounded-md border-t-2 px-1 py-1.5 text-xs transition ${
                x.player === me || x.number === 0 ? 'border-t-red/70' : 'border-t-text-muted/40'
              } ${
                current
                  ? 'bg-red font-semibold text-white'
                  : 'bg-surface hover:bg-surface-2 text-text-muted'
              }`}
            >
              <span className="tabular-nums">{x.number === 0 ? t('setupShort') : x.number}</span>
              {worst && (
                <span
                  className={`mx-auto mt-1 block h-1 w-1 rounded-full ${current ? 'bg-white' : tone(worst).dot}`}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Board ---------------------------------------------------------- */}
        <div className="border-border bg-surface rounded-xl border p-4 sm:p-5">
          <Side
            label={opponent}
            state={state}
            player={opponent}
            meta={t('opponentHand', { count: state.players[opponent].unknownHand })}
            {...board}
            reversed
          />

          <p className="border-border text-text-muted my-4 border-y border-dashed py-2 text-center text-xs">
            {state.stadium
              ? t('stadium', { name: state.stadium.card.name, owner: state.stadium.owner })
              : t('noStadium')}
          </p>

          <Side
            label={t('you')}
            state={state}
            player={me}
            // The discard count is not trivia for this deck: Partner Blast
            // scales on it, so it belongs next to the board, not in a footnote.
            meta={t('yourDiscard', { count: state.players[me].discard.length })}
            {...board}
          />

          <div className="border-border mt-5 border-t pt-4">
            <p className="text-text-muted mb-2 text-center text-xs font-semibold tracking-wide uppercase">
              {t('yourHand', { count: state.players[me].hand.length })}
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {state.players[me].hand.map((c, i) => (
                <CardArt
                  key={`${c.id}-${i}`}
                  name={c.name}
                  width={58}
                  card={cards[c.id]}
                  {...board}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Analysis ------------------------------------------------------- */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
          {/* Both grains of navigation, stacked: the turn, then the action
              inside it. Keeping them together means the eye never leaves the
              column to move the replay. */}
          <div className="border-border bg-surface flex flex-col gap-1.5 rounded-xl border p-2">
            <div className="flex items-center gap-2">
              <Arrow onClick={() => goTurn(-1)} disabled={turnAt <= 0} label={t('previousTurn')} />
              <p className="flex-1 truncate text-center text-sm font-semibold">{heading}</p>
              <Arrow
                onClick={() => goTurn(1)}
                disabled={turnAt >= allTurns.length - 1}
                label={t('nextTurn')}
                next
              />
            </div>
            <div className="bg-surface-2 flex items-center gap-2 rounded-lg p-1">
              <Arrow onClick={() => step(-1)} disabled={cursor === 0} label={t('previous')} small />
              {/* Flex children are blockified, which is what makes
                  ::first-letter apply — it is a no-op on an inline span. */}
              <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5 text-xs">
                <span className="text-text-muted shrink-0 tabular-nums">
                  {posInTurn + 1}/{turn.events.length}
                </span>
                <span className="truncate first-letter:uppercase">
                  {eventLabel(snap.event, me, opponent)}
                </span>
              </div>
              <Arrow
                onClick={() => step(1)}
                disabled={cursor === snapshots.length - 1}
                label={t('next')}
                small
                next
              />
            </div>
          </div>

          {turnMoments.length === 0 ? (
            <p className="border-border bg-surface text-text-muted rounded-xl border p-3.5 text-xs">
              {t('nothingThisTurn')}
            </p>
          ) : (
            turnMoments.map((m) => (
              <article
                key={`${m.line}-${m.title}`}
                className={`border-border bg-surface rounded-xl rounded-l-none border border-l-[3px] p-3.5 ${tone(m.severity).bar}`}
              >
                <h3 className="text-[13px] leading-snug font-semibold">{m.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-line">
                  {inlineMarkup(m.body).map((s, i) =>
                    s.bold ? (
                      <strong key={i} className="font-semibold">
                        {s.text}
                      </strong>
                    ) : s.italic ? (
                      <em key={i}>{s.text}</em>
                    ) : (
                      <span key={i}>{s.text}</span>
                    ),
                  )}
                </p>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  {m.cost ? (
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${tone(m.severity).text}`}
                    >
                      {[
                        m.cost.damage != null && t('costDamage', { value: m.cost.damage }),
                        m.cost.prizes != null && t('costPrizes', { count: m.cost.prizes }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => {
                      const i = snapshots.findIndex((s) => s.line === m.line);
                      if (i >= 0) setCursor(i);
                    }}
                    className="text-text-muted hover:text-text shrink-0 text-[11px] underline"
                  >
                    {t('jumpToMoment')}
                  </button>
                </div>
              </article>
            ))
          )}

          <div className="border-border bg-surface rounded-xl border">
            <h2 className="border-border text-text-muted border-b px-4 py-2.5 text-xs font-semibold tracking-wide uppercase">
              {t('turnLog')}
            </h2>
            <ol className="max-h-64 overflow-y-auto p-1.5">
              {turn.events.map((i, n) => {
                const sev = byEvent.get(i);
                const here = i === cursor;
                return (
                  <li key={i}>
                    <button
                      onClick={() => setCursor(i)}
                      aria-current={here ? 'step' : undefined}
                      className={`flex w-full items-baseline gap-2 rounded px-2 py-1 text-left text-xs transition ${
                        here ? 'bg-red/15 text-text font-medium' : 'hover:bg-surface-2'
                      }`}
                    >
                      <span
                        className={`w-4 shrink-0 text-right tabular-nums ${here ? 'text-red' : 'text-text-faint'}`}
                      >
                        {n + 1}
                      </span>
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${sev ? tone(sev).dot : 'bg-transparent'}`}
                        aria-hidden
                      />
                      <span className="first-letter:uppercase">
                        {eventLabel(snapshots[i].event, me, opponent)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>

      {preview && (
        <div
          className="border-border pointer-events-none fixed z-50 overflow-hidden rounded-lg border shadow-2xl"
          style={{ left: preview.left, top: preview.top, width: PREVIEW_W }}
        >
          <Image
            src={`${preview.card.image_url}/high.webp`}
            alt={preview.card.name}
            width={PREVIEW_W}
            height={PREVIEW_H}
            className="block"
            unoptimized
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */

/** The four replay controls, so they cannot drift apart from each other. */
function Arrow({
  onClick,
  disabled,
  label,
  small = false,
  next = false,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  small?: boolean;
  next?: boolean;
}) {
  const Icon = next ? ChevronRight : ChevronLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`border-border bg-surface-2 hover:bg-surface focus-visible:ring-red shrink-0 rounded-lg border focus-visible:ring-2 focus-visible:outline-none disabled:opacity-30 ${
        small ? 'p-1' : 'p-2'
      }`}
    >
      <Icon className={small ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
    </button>
  );
}

interface BoardProps {
  cards: Record<string, PtcgCardRow>;
  show: (card: PtcgCardRow | undefined, el: HTMLElement) => void;
  hide: () => void;
}

function Side({
  label,
  meta,
  state,
  player,
  cards,
  show,
  hide,
  reversed = false,
}: BoardProps & {
  label: string;
  meta: string;
  state: PtcgGameState;
  player: string;
  reversed?: boolean;
}) {
  const t = useTranslations('ptcg');
  const p = state.players[player];
  const board = { cards, show, hide };

  const active = (
    <div className="flex justify-center">
      {p.active ? (
        <CardArt
          name={p.active.name}
          width={118}
          card={cards[p.active.cardId]}
          pokemon={p.active}
          active
          {...board}
        />
      ) : (
        <div className="bg-surface-2 rounded" style={{ width: 118, height: 164 }} />
      )}
    </div>
  );
  const bench = (
    <div className="flex flex-wrap justify-center gap-2">
      {p.bench.map((k) => (
        <CardArt
          key={k.uid}
          name={k.name}
          width={78}
          card={cards[k.cardId]}
          pokemon={k}
          {...board}
        />
      ))}
    </div>
  );

  return (
    <div>
      <div className="text-text-muted mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
        <span className="font-semibold tracking-wide uppercase">{label}</span>
        <span className="tabular-nums">
          {t('prizesLeft', { count: p.prizesRemaining })} · {meta}
        </span>
      </div>
      {reversed ? (
        <>
          {bench}
          <div className="mt-2">{active}</div>
        </>
      ) : (
        <>
          {active}
          <div className="mt-2">{bench}</div>
        </>
      )}
    </div>
  );
}

function CardArt({
  card,
  name,
  pokemon,
  width,
  active = false,
  show,
  hide,
}: Omit<BoardProps, 'cards'> & {
  card?: PtcgCardRow;
  name: string;
  pokemon?: PtcgPokemonState;
  width: number;
  active?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const height = Math.round(width * 1.393);
  const hp = card?.hp ?? null;
  const left = hp && pokemon ? Math.max(0, hp - pokemon.damage) : null;

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      style={{ width }}
      onMouseEnter={() => ref.current && show(card, ref.current)}
      onMouseLeave={hide}
      onFocus={() => ref.current && show(card, ref.current)}
      onBlur={hide}
      tabIndex={card?.image_url ? 0 : undefined}
      title={name}
    >
      {card?.image_url ? (
        <Image
          src={`${card.image_url}/low.webp`}
          alt={name}
          width={width}
          height={height}
          className={`rounded transition ${active ? 'ring-red ring-2' : ''} hover:brightness-110`}
          unoptimized
        />
      ) : (
        <div
          className={`bg-surface-2 rounded ${active ? 'ring-red ring-2' : ''}`}
          style={{ width, height }}
        />
      )}
      {pokemon && pokemon.damage > 0 && (
        <span className="bg-red absolute top-1 right-1 rounded-full px-1.5 text-[11px] font-bold text-white tabular-nums">
          {pokemon.damage}
        </span>
      )}
      {pokemon && pokemon.attached.length > 0 && (
        <span className="bg-surface-2 text-text absolute bottom-1 left-1 rounded-full px-1.5 text-[11px] font-bold tabular-nums">
          +{pokemon.attached.length}
        </span>
      )}
      {left !== null && hp !== null && (
        <div className="bg-surface-2 mt-1 h-1 overflow-hidden rounded">
          <div
            className={left / hp <= 0.34 ? 'bg-red h-full' : 'h-full bg-emerald-500'}
            style={{ width: `${(left / hp) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
