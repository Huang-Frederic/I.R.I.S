import { describe, expect, it } from 'vitest';
import type { PtcgMoment } from '@/lib/types';
import { playScore } from './score';

const moment = (turn: number, severity: PtcgMoment['severity'], prizes?: number): PtcgMoment => ({
  line: turn,
  turn,
  severity,
  category: 'sequencing',
  title: 't',
  body: 'b',
  evidence: [],
  ...(prizes ? { cost: { prizes } } : {}),
});

describe('playScore', () => {
  it('gives a clean game full marks', () => {
    expect(playScore([], [1, 3, 5])!.score).toBe(100);
  });

  it('returns null when the player had no turns', () => {
    expect(playScore([moment(1, 'error')], [])).toBeNull();
  });

  it('does not dilute a mistake across a long game', () => {
    // The first model averaged per turn, so a decisive blunder in a ten-turn
    // game scored 80 — the clean turns drowned it. A mistake costs what it
    // costs however long the game ran.
    const short = playScore([moment(1, 'error')], [1, 3])!.score;
    const long = playScore([moment(1, 'error')], [1, 3, 5, 7, 9, 11, 13])!.score;
    expect(short).toBe(long);
  });

  it('counts findings that land on the opponent turn', () => {
    // Which Pokémon to promote after a knockout is decided during their turn.
    // Dropping those would hide the mistake entirely.
    expect(playScore([moment(2, 'error')], [1, 3])!.score).toBeLessThan(100);
  });

  it('weighs severity in order', () => {
    const of = (s: PtcgMoment['severity']) => playScore([moment(1, s)], [1])!.score;
    expect(of('note')).toBeGreaterThan(of('warning'));
    expect(of('warning')).toBeGreaterThan(of('error'));
    expect(of('good')).toBe(100); // already at the ceiling
  });

  it('treats a prize-costing error as decisive', () => {
    const plain = playScore([moment(1, 'error')], [1])!.score;
    const decisive = playScore([moment(1, 'error', 2)], [1])!.score;
    expect(plain).toBe(82);
    expect(decisive).toBe(65);
  });

  it('lets a good play offset part of a mistake', () => {
    expect(playScore([moment(1, 'warning'), moment(1, 'good')], [1])!.score).toBe(97);
  });

  it('floors at zero rather than going negative', () => {
    const wrecked = playScore(
      [moment(1, 'error', 2), moment(3, 'error', 2), moment(5, 'error', 2)],
      [1, 3, 5],
    )!;
    expect(wrecked.score).toBe(0);
  });

  it('keeps a per-turn breakdown so a score can be contested', () => {
    const s = playScore([moment(3, 'error')], [1, 3, 5])!;
    expect(s.turns).toEqual([
      { turn: 1, score: 100 },
      { turn: 3, score: 82 },
      { turn: 5, score: 100 },
    ]);
  });

  it('caps a turn at 100 so several good plays do not read as better than clean', () => {
    const s = playScore([moment(1, 'good'), moment(1, 'good'), moment(1, 'good')], [1])!;
    expect(s.turns[0].score).toBe(100);
  });
});
