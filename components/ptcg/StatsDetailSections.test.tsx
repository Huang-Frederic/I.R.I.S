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
  attachments: [{ card: 'Énergie Enrichissante', target: 'Méga-Lockpin-ex', count: 5 }],
  recoveries: [{ source: 'Civière Nocturne', card: 'Limonde', count: 3 }],
  attackers: [{ name: 'Limonde', attacks: 8, damage: 320, dmgPerAttack: 40 }],
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
      'sectionAttackers',
      'sectionAttachments',
      'sectionRecoveries',
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

  it('lists attacker, attachment and recovery rows', () => {
    render(<StatsDetailSections stats={stats} />);
    expect(screen.getByText('Limonde')).toBeInTheDocument();
    expect(screen.getByText('320')).toBeInTheDocument();
    expect(screen.getByText('Énergie Enrichissante → Méga-Lockpin-ex')).toBeInTheDocument();
    expect(screen.getByText('Civière Nocturne → Limonde')).toBeInTheDocument();
  });

  it('shows empty-state messages for attackers, attachments and recoveries when none were extracted', () => {
    render(<StatsDetailSections stats={{ ...stats, attackers: [], attachments: [], recoveries: [] }} />);
    expect(screen.getByText('noAttackers')).toBeInTheDocument();
    expect(screen.getByText('noAttachments')).toBeInTheDocument();
    expect(screen.getByText('noRecoveries')).toBeInTheDocument();
  });
});
