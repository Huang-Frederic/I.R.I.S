// components/ptcg/PtcgDashboard.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PtcgDashboard, { type DashboardGame } from './PtcgDashboard';
import type { GameLogStats } from '@/lib/ptcg/game-stats';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const stats: GameLogStats = {
  result: 'win',
  wentFirst: true,
  myTurns: 5,
  mulligansMe: 0,
  starter: 'Héricendre de Luth',
  boardT2: 2,
  evoTurn: {},
  firstAttackTurn: 2,
  supporterTurns: 3,
  cardsDrawn: 10,
  firstPrize: 'me',
  abilities: {},
  abilityGames: [],
  cardUse: {},
  kosDealt: 2,
  kosTaken: 1,
};

describe('<PtcgDashboard>', () => {
  it('links the Import affordance to the Battle Logs page instead of opening a modal', () => {
    render(<PtcgDashboard games={[]} />);
    const link = screen.getByRole('link', { name: 'importBtn' });
    expect(link).toHaveAttribute('href', '/ptcg');
  });

  it('does not link a game row anywhere — the per-game page no longer exists', () => {
    const games: DashboardGame[] = [
      {
        id: 'g1',
        playedAt: '2026-09-16T10:00:00.000Z',
        opponent: 'Bklee219',
        stats,
        result: 'win',
        play_score: null,
        myArchetype: 'Typhlosion',
        opponent_archetype: 'Amphinobi',
      },
    ];
    render(<PtcgDashboard games={games} />);
    expect(screen.queryAllByRole('link', { name: /Bklee219/ })).toHaveLength(0);
  });
});
