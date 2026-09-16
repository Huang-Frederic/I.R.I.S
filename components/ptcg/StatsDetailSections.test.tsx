import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatsDetailSections from './StatsDetailSections';
import type { AggregatedStats } from '@/lib/ptcg/game-stats';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const stats: AggregatedStats = {
  games: 10,
  wins: 6,
  losses: 4,
  ties: 0,
  winratePct: 60,
  avgScore: 75,
  first: { games: 5, wins: 4, winratePct: 80 },
  second: { games: 5, wins: 2, winratePct: 40 },
  mulliganPct: 10,
  starters: [{ name: 'Héricendre de Luth', pct: 100 }],
  boardT2Avg: 2.5,
  evoByT2Pct: 40,
  attackByT2Pct: 30,
  supporterTurnPct: 70,
  drawnPerGame: 8,
  abilities: [{ name: 'Unis par le Voyage', avg: 1.2, gamesPct: 90 }],
  firstPrizePct: 55,
  kosDealtAvg: 3,
  kosTakenAvg: 2,
  turnsAvg: 9,
  cards: [{ name: 'Ordres du Boss', played: 12, discarded: 1, perGame: 1.2 }],
};

describe('<StatsDetailSections>', () => {
  it('shows the KPI strip', () => {
    render(<StatsDetailSections stats={stats} />);
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('6-4')).toBeInTheDocument();
  });

  it('shows every rich section heading', () => {
    render(<StatsDetailSections stats={stats} />);
    for (const key of [
      'sectionTurnOrder',
      'sectionOpening',
      'sectionSetup',
      'sectionEngine',
      'sectionTempo',
      'sectionCards',
    ]) {
      expect(screen.getByText(key)).toBeInTheDocument();
    }
  });

  it('lists the abilities and card-usage rows', () => {
    render(<StatsDetailSections stats={stats} />);
    expect(screen.getByText('Unis par le Voyage')).toBeInTheDocument();
    expect(screen.getByText('Ordres du Boss')).toBeInTheDocument();
  });

  it('shows a "no abilities" message when none fired', () => {
    render(<StatsDetailSections stats={{ ...stats, abilities: [] }} />);
    expect(screen.getByText('noAbilities')).toBeInTheDocument();
  });
});
