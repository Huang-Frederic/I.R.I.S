'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import PtcgImportModal from './PtcgImportModal';
import { Dices, Rocket, Flame, Swords, ListChecks, Timer, Layers, Plus, Coins } from 'lucide-react';
import {
  aggregateStats,
  listMyArchetypes,
  type GameForStats,
  type AggregatedStats,
} from '@/lib/ptcg/game-stats';
import { archetypeSprite } from '@/lib/ptcg/archetype';

/** A game row with everything the dashboard and the list below need. */
export interface DashboardGame extends GameForStats {
  id: string;
  playedAt: string;
  opponent: string;
}

const ALL = '__all__';

/** A pixel sprite for an archetype, crisp-scaled. Null archetypes (ace
 *  fallbacks) render nothing so the layout stays aligned. */
function Sprite({ label, size = 28 }: { label: string; size?: number }) {
  const url = archetypeSprite(label);
  if (!url) return <span className="inline-block shrink-0" style={{ width: size, height: size }} />;
  return (
    <Image
      src={url}
      alt=""
      width={size}
      height={size}
      unoptimized
      aria-hidden
      className="shrink-0 [image-rendering:pixelated]"
    />
  );
}

function Meter({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
  const tone = pct >= 60 ? 'bg-emerald-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span className="font-mono text-sm font-bold tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="bg-surface-2 mt-1 h-2 overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      {hint && <p className="text-text-faint mt-1 text-[11px]">{hint}</p>}
    </div>
  );
}

/** A bare number with a caption — for the averages a percentage would distort
 *  (a board size, cards drawn, KOs per game). */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-border bg-surface-2/40 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="font-mono text-xl font-bold tabular-nums">{value}</span>
      </div>
      {hint && <p className="text-text-muted mt-1 text-xs">{hint}</p>}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-surface rounded-xl border p-4">
      <h2 className="text-text-muted mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

function ImportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-red hover:bg-red/90 flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold text-white transition"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

export default function PtcgDashboard({ games }: { games: DashboardGame[] }) {
  const t = useTranslations('ptcgStats');
  const tp = useTranslations('ptcg');
  const router = useRouter();
  const decks = useMemo(() => listMyArchetypes(games), [games]);
  // Default to the deck of the most recently played game (games arrive newest
  // first), so the dashboard opens on the list currently being played.
  const [deck, setDeck] = useState<string>(games[0]?.myArchetype ?? ALL);
  const [importOpen, setImportOpen] = useState(false);

  // A soft refresh re-runs the server page (re-reads every log) so the new duel
  // shows up in place — no full reload, and the deck filter is preserved.
  const onImported = () => {
    setImportOpen(false);
    router.refresh();
  };
  const importModal = (
    <PtcgImportModal
      open={importOpen}
      onClose={() => setImportOpen(false)}
      onImported={onImported}
    />
  );

  const filtered = deck === ALL ? games : games.filter((g) => g.myArchetype === deck);
  const s: AggregatedStats = useMemo(() => aggregateStats(filtered), [filtered]);

  if (games.length === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border px-4 py-12 text-center">
        <p className="text-sm font-semibold">{t('emptyTitle')}</p>
        <p className="text-text-muted mx-auto mt-1 mb-5 max-w-md text-sm">{t('emptyBody')}</p>
        <div className="flex justify-center">
          <ImportButton label={t('importBtn')} onClick={() => setImportOpen(true)} />
        </div>
        {importModal}
      </div>
    );
  }

  const kpi = (label: string, value: string, accent?: string) => (
    <div className="border-border bg-surface rounded-xl border px-3 py-3 text-center">
      <p className="text-text-muted text-[11px] font-semibold tracking-wide uppercase">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${accent ?? ''}`}>{value}</p>
    </div>
  );

  const maxStarter = Math.max(...s.starters.map((x) => x.pct), 1);
  const resultChip = (r: 'win' | 'loss' | 'tie') =>
    r === 'win'
      ? 'bg-emerald-500/15 text-emerald-500'
      : r === 'loss'
        ? 'bg-red/15 text-red'
        : 'bg-surface-2 text-text-muted';

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: deck-version filter + a permanent way back to Import. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {decks.length > 1 && (
            <>
              <span className="text-text-muted text-xs font-semibold tracking-wide uppercase">
                {t('deckFilter')}
              </span>
              {decks.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => setDeck(d.name)}
                  aria-pressed={deck === d.name}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    deck === d.name
                      ? 'bg-red border-red text-white'
                      : 'border-border bg-surface hover:border-red/50'
                  }`}
                >
                  <Sprite label={d.name} size={18} />
                  {d.name} <span className="opacity-70">· {d.games}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDeck(ALL)}
                aria-pressed={deck === ALL}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  deck === ALL
                    ? 'bg-red border-red text-white'
                    : 'border-border bg-surface hover:border-red/50'
                }`}
              >
                {t('deckAll', { count: games.length })}
              </button>
            </>
          )}
        </div>
        <ImportButton label={t('importBtn')} onClick={() => setImportOpen(true)} />
      </div>
      {importModal}

      {/* KPI strip. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpi(t('kpiGames'), String(s.games))}
        {kpi(
          t('kpiWinrate'),
          `${s.winratePct.toFixed(0)}%`,
          s.winratePct >= 50 ? 'text-emerald-500' : 'text-red',
        )}
        {kpi(t('kpiRecord'), `${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}`)}
        {kpi(t('kpiScore'), s.avgScore != null ? s.avgScore.toFixed(0) : '—')}
      </div>

      {/* Turn order — is my winrate better on the play or on the draw? */}
      <Section
        icon={<Coins className="text-red h-4 w-4" aria-hidden />}
        title={t('sectionTurnOrder')}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [t('goingFirst'), s.first],
              [t('goingSecond'), s.second],
            ] as const
          ).map(([label, sp]) => (
            <div
              key={label}
              className="border-border bg-surface-2/40 flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-text-faint mt-0.5 text-[11px]">
                  {sp.wins}/{sp.games} {t('kpiGames').toLowerCase()}
                </p>
              </div>
              <span
                className={`font-mono text-2xl font-bold tabular-nums ${
                  sp.games === 0
                    ? 'text-text-faint'
                    : sp.winratePct >= 50
                      ? 'text-emerald-500'
                      : 'text-red'
                }`}
              >
                {sp.games === 0 ? '—' : `${sp.winratePct.toFixed(0)}%`}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Opening — mulligans, a developed turn-2 board, and what I open on. */}
      <Section
        icon={<Dices className="text-red h-4 w-4" aria-hidden />}
        title={t('sectionOpening')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Meter label={t('mulligan')} pct={s.mulliganPct} hint={t('mulliganHint')} />
            <Stat label={t('boardT2')} value={s.boardT2Avg.toFixed(1)} hint={t('boardT2Hint')} />
          </div>
          <div>
            <p className="text-text-muted mb-2 text-[11px] font-semibold tracking-wide uppercase">
              {t('starterDist')}
            </p>
            <div className="flex flex-col gap-1.5">
              {s.starters.map((st) => (
                <div key={st.name} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate">{st.name}</span>
                  <div className="bg-surface-2 h-4 flex-1 overflow-hidden rounded">
                    <div
                      className="bg-red/70 h-full rounded"
                      style={{ width: `${(st.pct / maxStarter) * 100}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right font-mono tabular-nums">
                    {st.pct.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Setup speed — how fast the board comes online, whatever the deck. */}
      <Section icon={<Rocket className="text-red h-4 w-4" aria-hidden />} title={t('sectionSetup')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Meter label={t('evoT2')} pct={s.evoByT2Pct} hint={t('evoT2Hint')} />
          <Meter label={t('attackT2')} pct={s.attackByT2Pct} hint={t('attackT2Hint')} />
        </div>
      </Section>

      {/* Engine — Ethan's Adventure throughput and the abilities that fired. */}
      <Section icon={<Flame className="text-red h-4 w-4" aria-hidden />} title={t('sectionEngine')}>
        <div className="border-border grid gap-3 border-b pb-3 sm:grid-cols-2">
          <Meter
            label={t('supporterRate')}
            pct={s.supporterTurnPct}
            hint={t('supporterRateHint')}
          />
          <Stat
            label={t('drawnPerGame')}
            value={s.drawnPerGame.toFixed(0)}
            hint={t('drawnPerGameHint')}
          />
        </div>
        <p className="text-text-muted mt-3 mb-2 text-[11px] font-semibold tracking-wide uppercase">
          {t('abilitiesTitle')}
        </p>
        {s.abilities.length === 0 ? (
          <p className="text-text-faint text-sm">{t('noAbilities')}</p>
        ) : (
          <ul className="divide-border divide-y">
            {s.abilities.map((ab) => (
              <li key={ab.name} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">{ab.name}</span>
                <span className="text-text-muted shrink-0 font-mono text-xs tabular-nums">
                  {t('perGame', { avg: ab.avg.toFixed(1) })}
                  <span className="text-text-faint">
                    {' '}
                    · {t('inGamesPct', { pct: ab.gamesPct.toFixed(0) })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Tempo — who sets the pace, and how the prize race actually runs. */}
      <Section icon={<Timer className="text-red h-4 w-4" aria-hidden />} title={t('sectionTempo')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Meter label={t('firstPrize')} pct={s.firstPrizePct} hint={t('firstPrizeHint')} />
          <div className="flex flex-col gap-3">
            <Stat
              label={t('koRatio')}
              value={`${s.kosDealtAvg.toFixed(1)} / ${s.kosTakenAvg.toFixed(1)}`}
              hint={t('koRatioHint')}
            />
            <Stat label={t('turnsAvg')} value={s.turnsAvg.toFixed(1)} hint={t('turnsAvgHint')} />
          </div>
        </div>
      </Section>

      {/* Matchups, with a pixel sprite per opposing archetype. */}
      <Section
        icon={<Swords className="text-red h-4 w-4" aria-hidden />}
        title={t('sectionMatchups')}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-left text-[11px] tracking-wide uppercase">
                <th className="py-1.5 pr-2 font-semibold">{t('colDeck')}</th>
                <th className="px-2 py-1.5 text-right font-semibold">{t('colGames')}</th>
                <th className="px-2 py-1.5 text-right font-semibold">{t('colRecord')}</th>
                <th className="py-1.5 pl-2 text-right font-semibold">{t('colWinrate')}</th>
              </tr>
            </thead>
            <tbody>
              {s.byArchetype.map((a) => {
                const wr = a.games ? (a.wins / a.games) * 100 : 0;
                return (
                  <tr key={a.name} className="border-border border-t">
                    <td className="py-2 pr-2">
                      <span className="flex items-center gap-2">
                        <Sprite label={a.name} />
                        {a.name}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{a.games}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">
                      {a.wins}-{a.losses}
                    </td>
                    <td
                      className={`py-2 pl-2 text-right font-mono font-semibold tabular-nums ${
                        wr >= 50 ? 'text-emerald-500' : 'text-red'
                      }`}
                    >
                      {wr.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Card usage — plays/attaches vs discards, to spot cards pulling no weight. */}
      <Section icon={<Layers className="text-red h-4 w-4" aria-hidden />} title={t('sectionCards')}>
        <p className="text-text-faint mb-2 text-[11px]">{t('cardsHint')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-left text-[11px] tracking-wide uppercase">
                <th className="py-1.5 pr-2 font-semibold">{t('colCard')}</th>
                <th className="px-2 py-1.5 text-right font-semibold">{t('colPlayed')}</th>
                <th className="px-2 py-1.5 text-right font-semibold">{t('colDiscarded')}</th>
                <th className="py-1.5 pl-2 text-right font-semibold">{t('colPerGame')}</th>
              </tr>
            </thead>
            <tbody>
              {s.cards.map((c) => {
                // Never played, only discarded → a candidate dead card.
                const dead = c.played === 0 && c.discarded > 0;
                return (
                  <tr key={c.name} className="border-border border-t">
                    <td className="py-2 pr-2">
                      <span className="flex items-center gap-2">
                        <span className={dead ? 'text-text-muted' : ''}>{c.name}</span>
                        {dead && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            {t('cardDead')}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{c.played}</td>
                    <td className="text-text-muted px-2 py-2 text-right font-mono tabular-nums">
                      {c.discarded}
                    </td>
                    <td className="py-2 pl-2 text-right font-mono tabular-nums">
                      {c.perGame.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* The games themselves, newest first, tap to replay. */}
      <Section
        icon={<ListChecks className="text-red h-4 w-4" aria-hidden />}
        title={t('sectionGames')}
      >
        <ul className="divide-border divide-y">
          {filtered.map((g) => (
            <li key={g.id}>
              <Link
                href={`/ptcg/${g.id}`}
                className="hover:bg-surface-2 -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition"
              >
                <span
                  className={`w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-bold ${resultChip(g.result)}`}
                >
                  {tp(`result_${g.result}` as 'result_win')}
                </span>
                <Sprite label={g.opponent_archetype ?? ''} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {g.opponent_archetype ?? g.opponent}
                  <span className="text-text-faint ml-2 text-xs">{g.opponent}</span>
                </span>
                {g.play_score != null && (
                  <span className="text-text-muted shrink-0 font-mono text-xs tabular-nums">
                    {g.play_score}
                  </span>
                )}
                <span className="text-text-faint shrink-0 text-xs tabular-nums">
                  {g.playedAt.slice(0, 10)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <p className="text-text-faint text-center text-[11px] leading-relaxed">{t('footnote')}</p>
    </div>
  );
}
