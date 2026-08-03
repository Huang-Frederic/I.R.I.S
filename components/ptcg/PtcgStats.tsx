import { getTranslations } from 'next-intl/server';
import { Dices, Rocket, Flame, Swords } from 'lucide-react';
import type { AggregatedStats } from '@/lib/ptcg/game-stats';

/** A labelled horizontal meter, 0-100%. Green past 60, amber 35-60, red under. */
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

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
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

export default async function PtcgStats({ stats: s }: { stats: AggregatedStats }) {
  const t = await getTranslations('ptcgStats');

  if (s.games === 0) {
    return (
      <div className="border-border bg-surface rounded-xl border px-4 py-12 text-center">
        <p className="text-sm font-semibold">{t('emptyTitle')}</p>
        <p className="text-text-muted mx-auto mt-1 max-w-md text-sm">{t('emptyBody')}</p>
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

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip — the headline the whole page answers to. */}
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

      {/* Opening — mulligans and the forced Active. */}
      <Card icon={<Dices className="text-red h-4 w-4" aria-hidden />} title={t('sectionOpening')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Meter label={t('mulligan')} pct={s.mulliganPct} hint={t('mulliganHint')} />
            <Meter label={t('energyT1')} pct={s.energyT1Pct} />
            <div className="flex items-baseline justify-between">
              <span className="text-sm">{t('benchT1')}</span>
              <span className="font-mono text-sm font-bold tabular-nums">
                {s.benchT1Avg.toFixed(1)}
              </span>
            </div>
          </div>
          <div>
            <p className="text-text-muted mb-2 text-[11px] font-semibold tracking-wide uppercase">
              {t('starterDist')}
            </p>
            <div className="flex flex-col gap-1.5">
              {s.starters.map((st) => (
                <div key={st.name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 shrink-0 truncate">{st.name}</span>
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
      </Card>

      {/* Setup speed — how fast the line comes online. */}
      <Card icon={<Rocket className="text-red h-4 w-4" aria-hidden />} title={t('sectionSetup')}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Meter label={t('feurissonT2')} pct={s.quilavaByT2Pct} />
          <Meter label={t('typhlosionT3')} pct={s.typhlosionByT3Pct} />
          <Meter label={t('energyPerTurn')} pct={s.energyTurnsPct} />
        </div>
      </Card>

      {/* Engine — fuel and free abilities. */}
      <Card icon={<Flame className="text-red h-4 w-4" aria-hidden />} title={t('sectionEngine')}>
        <div className="flex items-baseline justify-between border-b border-border pb-2.5">
          <span className="text-sm">{t('adlPerGame')}</span>
          <span className="font-mono text-lg font-bold tabular-nums">
            {s.adlPlayedAvg.toFixed(1)}
          </span>
        </div>
        <p className="text-text-muted mt-3 mb-2 text-[11px] font-semibold tracking-wide uppercase">
          {t('abilitiesTitle')}
        </p>
        {s.abilities.length === 0 ? (
          <p className="text-text-faint text-sm">{t('noAbilities')}</p>
        ) : (
          <ul className="divide-border divide-y">
            {s.abilities.map((ab) => (
              <li key={ab.name} className="flex items-center justify-between py-1.5 text-sm">
                <span>{ab.name}</span>
                <span className="text-text-muted font-mono tabular-nums">
                  {t('perGame', { avg: ab.avg.toFixed(1) })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Matchup breakdown. */}
      <Card icon={<Swords className="text-red h-4 w-4" aria-hidden />} title={t('sectionMatchups')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-left text-[11px] uppercase tracking-wide">
                <th className="py-1.5 pr-2 font-semibold">{t('colDeck')}</th>
                <th className="py-1.5 px-2 text-right font-semibold">{t('colGames')}</th>
                <th className="py-1.5 px-2 text-right font-semibold">{t('colRecord')}</th>
                <th className="py-1.5 pl-2 text-right font-semibold">{t('colWinrate')}</th>
              </tr>
            </thead>
            <tbody>
              {s.byArchetype.map((a) => {
                const wr = a.games ? (a.wins / a.games) * 100 : 0;
                return (
                  <tr key={a.name} className="border-border border-t">
                    <td className="py-2 pr-2">{a.name}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">{a.games}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">
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
      </Card>

      <p className="text-text-faint text-center text-[11px] leading-relaxed">{t('footnote')}</p>
    </div>
  );
}
