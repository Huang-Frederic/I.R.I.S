import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GameLogViewer from './GameLogViewer';
import type { PtcgGameState, PtcgSnapshot, PtcgTurnIndex } from '@/lib/types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const rawLog = [
  'Partie commencée entre Hisshiden et Bklee219.',
  'Hisshiden a pioché 7 cartes pour sa main de départ.',
  'Tour de Hisshiden',
  'Hisshiden a joué (sv10_32) Héricendre de Luth sur le Poste Actif.',
  'Tour de Bklee219',
  '(sv6_214) Amphinobi-ex de Bklee219 a utilisé Aqua Jet.',
].join('\n');

// Only `line` and `turnNumber` matter to this component — `event`/`state`
// are never read by it, so they're stubbed.
const snap = (line: number, turnNumber: number): PtcgSnapshot => ({
  line,
  turnNumber,
  event: {},
  state: {} as PtcgGameState,
});

const snapshots: PtcgSnapshot[] = [snap(2, 0), snap(4, 1), snap(6, 2)];

const turns: PtcgTurnIndex[] = [
  { number: 1, player: 'Hisshiden', events: [1] },
  { number: 2, player: 'Bklee219', events: [2] },
];

describe('GameLogViewer', () => {
  it('renders a setup section from turnNumber-0 snapshots even though turns has no entry for it', () => {
    render(
      <GameLogViewer me="Hisshiden" opponent="Bklee219" rawLog={rawLog} snapshots={snapshots} turns={turns} />,
    );
    expect(
      screen.getByText('Hisshiden a pioché 7 cartes pour sa main de départ.'),
    ).toBeInTheDocument();
  });

  it('shows the exact raw log line for each turn, verbatim', () => {
    render(
      <GameLogViewer me="Hisshiden" opponent="Bklee219" rawLog={rawLog} snapshots={snapshots} turns={turns} />,
    );
    expect(
      screen.getByText('Hisshiden a joué (sv10_32) Héricendre de Luth sur le Poste Actif.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('(sv6_214) Amphinobi-ex de Bklee219 a utilisé Aqua Jet.'),
    ).toBeInTheDocument();
  });

  it("colors my turn's section differently from the opponent's turn", () => {
    render(
      <GameLogViewer me="Hisshiden" opponent="Bklee219" rawLog={rawLog} snapshots={snapshots} turns={turns} />,
    );
    const mySection = screen
      .getByText('Hisshiden a joué (sv10_32) Héricendre de Luth sur le Poste Actif.')
      .closest('section');
    const theirSection = screen
      .getByText('(sv6_214) Amphinobi-ex de Bklee219 a utilisé Aqua Jet.')
      .closest('section');
    expect(mySection?.className).toContain('border-red');
    expect(theirSection?.className).not.toContain('border-red');
  });
});
