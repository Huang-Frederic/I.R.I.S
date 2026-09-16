'use client';

import { useTranslations } from 'next-intl';
import { Dices, Rocket, Flame, Timer, Layers, Coins } from 'lucide-react';
import type { AggregatedStats } from '@/lib/ptcg/game-stats';

function Meter({ label, pct, hint }: { label: string; pct: number; hint?: string }) {
  const tone = pct >= 60 ? 'bg-emerald-500' : pct >= 35 ? 'bg-amber-500' : 'bg-red';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm">{label}</span>
        <span className="font-mono text-sm font-bold tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="bg-surface-2 mt-1 h-2 overflow-hidden rounded-full">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {hint && <p className="text-text-faint mt-1 text-[11px]">{hint}</p>}
    </div>
  );
}

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

/** The rich per-metric breakdown (turn order, opening, setup speed, engine,
 *  tempo, card usage) for one already-filtered subset of games — reusable at
 *  any of the Stats drill-down's granularities. Lifted near-verbatim from the
 *  old single-view dashboard this replaces. */
export default function StatsDetailSections({ stats: s }: { stats: AggregatedStats }) {
  const t = useTranslations('ptcgStats');

  const kpi = (label: string, value: string, accent?: string) => (
    <div key={label} className="border-border bg-surface rounded-xl border px-3 py-3 text-center">
      <p className="text-text-muted text-[11px] font-semibold tracking-wide uppercase">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-bold tabular-nums ${accent ?? ''}`}>{value}</p>
    </div>
  );

  const maxStarter = Math.max(...s.starters.map((x) => x.pct), 1);

  return (
    <div className="flex flex-col gap-4">
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

      <Section icon={<Coins className="text-red h-4 w-4" aria-hidden />} title={t('sectionTurnOrder')}>
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

      <Section icon={<Dices className="text-red h-4 w-4" aria-hidden />} title={t('sectionOpening')}>
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

      <Section icon={<Rocket className="text-red h-4 w-4" aria-hidden />} title={t('sectionSetup')}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Meter label={t('evoT2')} pct={s.evoByT2Pct} hint={t('evoT2Hint')} />
          <Meter label={t('attackT2')} pct={s.attackByT2Pct} hint={t('attackT2Hint')} />
        </div>
      </Section>

      <Section icon={<Flame className="text-red h-4 w-4" aria-hidden />} title={t('sectionEngine')}>
        <div className="border-border grid gap-3 border-b pb-3 sm:grid-cols-2">
          <Meter label={t('supporterRate')} pct={s.supporterTurnPct} hint={t('supporterRateHint')} />
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
                  <span className="text-text-faint"> · {t('inGamesPct', { pct: ab.gamesPct.toFixed(0) })}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

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
                    <td className="py-2 pl-2 text-right font-mono tabular-nums">{c.perGame.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
