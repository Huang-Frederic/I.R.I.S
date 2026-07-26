import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenize';
import { buildStates } from './state';

const FIXTURE = readFileSync(
  join(process.cwd(), 'lib/ptcg/fixtures/amphinobi-2026-07-25.txt'),
  'utf8',
);

const built = buildStates(tokenize(FIXTURE));
const ME = 'Hisshiden';
const OPP = 'Bklee219';

/**
 * State just after the top-level event on the given log line.
 * Snapshots exist per top-level event, so `- ...` sub-event lines have none —
 * anchor on their parent instead.
 */
const atLine = (line: number) => {
  const snap = built.snapshots.find((s) => s.line === line);
  if (!snap) throw new Error(`No snapshot at line ${line} — is it a sub-event line?`);
  return snap.state;
};

describe('buildStates', () => {
  it('reconstructs the opening board', () => {
    const s = atLine(12); // last setup placement
    expect(s.players[ME].active?.name).toBe('Fantyrm');
    expect(s.players[ME].bench.map((k) => k.name)).toEqual(['Victini']);
    expect(s.players[OPP].active?.name).toBe('Minidraco');
    // 7 drawn, 2 placed.
    expect(s.players[ME].hand).toHaveLength(5);
  });

  it('keeps the opponent hand as a count, never as cards', () => {
    const s = atLine(12);
    expect(s.players[OPP].hand).toEqual([]);
    expect(s.players[OPP].unknownHand).toBeGreaterThan(0);
  });

  it('holds two Feurisson in play at turn 5, with one ability unused', () => {
    // This is the finding the whole coach rests on. Between L88 and L96 there
    // are two Feurisson; only one "Unis par le Voyage" was triggered. The lost
    // Aventure de Luth is worth 60 damage on the following attack.
    const after = atLine(88);
    const feurisson = [after.players[ME].active, ...after.players[ME].bench].filter(
      (k) => k?.cardId === 'sv10_33',
    );
    expect(feurisson).toHaveLength(2);
    expect(feurisson.map((k) => k!.placedTurn).sort()).toEqual([1, 3]);
  });

  it('evolves the eligible Pokémon, not merely the first match', () => {
    // At L96 both Feurisson are on the board, but the one created at L88 evolved
    // this turn and cannot evolve again. The rule must pick the older instance.
    const before = atLine(88);
    const older = [before.players[ME].active, ...before.players[ME].bench].find(
      (k) => k?.cardId === 'sv10_33' && k.placedTurn === 1,
    )!;
    const after = atLine(96);
    const typhlosion = [after.players[ME].active, ...after.players[ME].bench].find(
      (k) => k?.cardId === 'sv10_34',
    )!;
    expect(typhlosion.uid).toBe(older.uid);
    expect(typhlosion.stack.map((c) => c.id)).toEqual(['sv10_32', 'sv10_33']);
  });

  it('corrects the misreported owner on damage counters', () => {
    // The log says the counters land on Bklee219's Héricendre. Bklee219 has no
    // Héricendre — it is Hisshiden's, and it must take the damage.
    const s = atLine(67); // Shuriken Mortel — the counters land in its sub-events
    const hurt = [s.players[ME].active, ...s.players[ME].bench].filter((k) => k!.damage > 0);
    expect(hurt).toHaveLength(1);
    expect(hurt[0]!.cardId).toBe('sv10_32');
    expect(hurt[0]!.damage).toBe(60);
    expect([s.players[OPP].active, ...s.players[OPP].bench].every((k) => k!.damage === 0)).toBe(
      true,
    );
    expect(built.warnings.some((w) => w.kind === 'owner-corrected')).toBe(true);
  });

  it('accumulates Aventure de Luth in the discard, since damage scales on it', () => {
    expect(atLine(47).players[ME].discard.filter((c) => c.id === 'sv10_221')).toHaveLength(1);
    expect(atLine(92).players[ME].discard.filter((c) => c.id === 'sv10_221')).toHaveLength(2);
    expect(atLine(135).players[ME].discard.filter((c) => c.id === 'sv10_221')).toHaveLength(3);
  });

  it('tracks attachments through evolution and knockout', () => {
    const s = atLine(161); // Bracelet Vaillant attached, just before the attack
    const active = s.players[ME].active!;
    expect(active.cardId).toBe('sv10_34');
    expect(active.attached.map((c) => c.id).sort()).toEqual(['rsv10-5_80', 'sv3_230']);
  });

  it('sends the whole Pokémon to the discard on a knockout', () => {
    const before = atLine(186);
    const target = before.players[ME].active!;
    const carried = target.stack.length + target.attached.length + 1;
    const after = atLine(193);
    expect(after.players[ME].discard.length - before.players[ME].discard.length).toBe(carried);
    expect(after.players[ME].active).toBeNull();
  });

  it('ends with the winner on zero prizes remaining', () => {
    expect(built.final.winner).toBe(OPP);
    expect(built.final.players[OPP].prizesRemaining).toBe(0);
    expect(built.final.players[ME].prizesRemaining).toBe(3);
  });

  it('records ambiguities instead of hiding them', () => {
    // Duplicate cards cannot always be told apart. What matters is that the
    // guesses are visible, so a claim resting on one can be discounted.
    expect(built.ambiguities.length).toBeGreaterThan(0);
    for (const a of built.ambiguities) {
      expect(a.candidates).toBeGreaterThan(1);
      expect(a.line).toBeGreaterThan(0);
    }
  });
});

describe('promotion confirmée après un déplacement forcé', () => {
  it('does not re-resolve a Pokémon that is already Active', () => {
    // "X est maintenant sur le Poste Actif" also follows a Boss's Orders that
    // already moved X up. Re-resolving that confirmation picks a *different*
    // copy when several are in play, demoting the one actually dragged up —
    // and the wrong cards land in the discard two knockouts later.
    const log = [
      'Préparation',
      'A a joué (c_1) Pikachu sur le Poste Actif.',
      'B a joué (c_2) Rattata sur le Poste Actif.',
      'B a joué (c_3) Zacian sur le Banc.',
      'B a joué (c_3) Zacian sur le Banc.',
      '',
      'Tour de B',
      'B a attaché (c_9) Bandeau à (c_3) Zacian sur le Banc.',
      'B a mis fin à son tour.',
      '',
      'Tour de A',
      'A a joué (c_8) Ordres du Boss.',
      '- (c_3) Zacian de B a été échangé contre (c_2) Rattata de B pour devenir le Pokémon Actif.',
      '(c_3) Zacian de B est maintenant sur le Poste Actif.',
      'A a mis fin à son tour.',
    ].join('\n');

    const built = buildStates(tokenize(log));
    const active = built.final.players.B.active!;
    // The one dragged up is the one that was built, not the bare copy.
    expect(active.cardId).toBe('c_3');
    expect(active.attached.map((a) => a.id)).toEqual(['c_9']);
  });
});

describe('promotion parmi plusieurs copies', () => {
  it('promotes the copy that can act, not the first in the array', () => {
    // Array order is no tiebreak: retreating pushes the outgoing Pokémon to the
    // end of the bench, so a freshly evolved copy can sit ahead of the one that
    // was built. A player promotes something that can attack.
    const log = [
      'Préparation',
      'A a joué (c_1) Pikachu sur le Poste Actif.',
      'B a joué (c_2) Rattata sur le Poste Actif.',
      'B a joué (c_3) Zubat sur le Banc.',
      'B a joué (c_3) Zubat sur le Banc.',
      '',
      'Tour de B',
      'B a attaché (c_9) Énergie à (c_3) Zubat sur le Banc.',
      'B a mis fin à son tour.',
      '',
      'Tour de A',
      'A a mis fin à son tour.',
      '',
      'Tour de B',
      'B a fait battre en retraite (c_2) Rattata sur le Banc.',
      '(c_3) Zubat de B est maintenant sur le Poste Actif.',
      'B a mis fin à son tour.',
    ].join('\n');

    const built = buildStates(tokenize(log));
    expect(built.final.players.B.active!.attached.map((a) => a.id)).toEqual(['c_9']);
  });
});

describe('retour de cartes en main', () => {
  const base = (recovery: string) =>
    [
      'Préparation',
      'A a joué (c_1) Pikachu sur le Poste Actif.',
      'B a joué (c_2) Rattata sur le Poste Actif.',
      '',
      'Tour de A',
      'A a attaché (c_9) Énergie à (c_1) Pikachu sur le Poste Actif.',
      'A a mis fin à son tour.',
      '',
      'Tour de B',
      'B a mis fin à son tour.',
      '',
      'Tour de A',
      recovery,
      '- A a déplacé (c_9) Énergie de A vers sa main.',
      'A a mis fin à son tour.',
    ].join('\n');

  it('takes from the discard rather than stripping a Pokémon in play', () => {
    // Civière Nocturne recovers from the DISCARD. Searching the board first
    // pulled the Energy off the Active, and that Pokémon then went down
    // carrying one card too few — which the knockout oracle reported.
    const withDiscard = buildStates(
      tokenize(
        base(
          [
            'A a joué (c_7) Hyper Ball.',
            '- A a défaussé (c_9) Énergie.',
            'A a joué (c_8) Civière Nocturne.',
          ].join('\n'),
        ),
      ),
    );
    expect(withDiscard.final.players.A.active!.attached.map((a) => a.id)).toEqual(['c_9']);
  });

  it('still detaches when the discard holds no copy', () => {
    // The fallback has to stay: some cards really do return an attached card.
    const built = buildStates(tokenize(base('A a joué (c_8) Civière Nocturne.')));
    expect(built.final.players.A.active!.attached).toHaveLength(0);
  });
});
