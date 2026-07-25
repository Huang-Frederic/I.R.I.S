/**
 * Validates the reconstruction against the log's own damage oracle.
 *
 * The "Analyse des dégâts" blocks carry the exact breakdown computed by the
 * official engine. That makes them a free oracle: if our reconstructed state
 * cannot reproduce those numbers, our state is wrong and nothing built on top
 * of it can be trusted. A failing report must block the analysis — a confident
 * report built on a wrong state is worse than no report.
 */

import type { PtcgValidationReport } from '@/lib/types';
import type { PtcgEvent, PtcgTokenizeResult } from './tokenize';
import type { PtcgBuildResult } from './state';

/**
 * Attacks whose damage counts specific cards in the discard.
 *
 * The log says "(3) cartes dans la pile de défausse" without saying which ones —
 * only the card text does. So the mapping is written down explicitly rather than
 * guessed, and an unmodelled attack is reported as unchecked rather than passed.
 */
const DISCARD_COUNTERS: Record<string, { cardId: string; per: number }> = {
  // Explosion Partenaire: +60 per Aventure de Luth in the discard.
  'Explosion Partenaire': { cardId: 'sv10_221', per: 60 },
};

export function validate(built: PtcgBuildResult, tokens: PtcgTokenizeResult): PtcgValidationReport {
  const checks: PtcgValidationReport['checks'] = [];
  const pass = (kind: string, detail: string) => checks.push({ ok: true, kind, detail });
  const skip = (kind: string, detail: string) => checks.push({ ok: null, kind, detail });
  const fail = (kind: string, detail: string, expected: unknown, got: unknown) =>
    checks.push({ ok: false, kind, detail, expected, got });

  const snapAtLine = new Map(built.snapshots.map((s) => [s.line, s]));

  for (const ev of tokens.events) {
    const analysis = (ev.children ?? []).find((c) => c.type === 'damage-analysis');
    if (analysis) validateDamage(ev, analysis);
    if (ev.type === 'ko' && ev.discarded) validateKnockout(ev);
  }

  // The winner must have taken all six prizes.
  if (built.final.winner) {
    const rem = built.final.players[built.final.winner].prizesRemaining;
    if (rem !== 0) fail('prizes', `winner ${built.final.winner}`, 0, rem);
    else pass('prizes', `${built.final.winner} at 0 prizes remaining`);
  }

  const failed = checks.filter((c) => c.ok === false);
  return { ok: failed.length === 0, checks };

  function validateDamage(ev: PtcgEvent, analysis: PtcgEvent) {
    const entries = analysis.entries ?? [];
    const total = entries.find((e) => /^Total de dégâts$/i.test(e.label));
    const parts = entries.filter((e) => e !== total);
    const sum = parts.reduce((a, e) => a + e.damage, 0);
    const move = (ev.move as string) ?? '';

    // The breakdown is NOT exhaustive: optional attack modes (the +80 on Hélice
    // Ninja) are never itemised. A positive residual is therefore expected. A
    // negative one would mean we are counting something twice.
    if (!total) {
      fail('analysis-missing-total', `L${ev.line}`, 'a Total row', 'absent');
    } else if (sum > total.damage) {
      fail('damage-sum', `L${ev.line} ${move}`, total.damage, sum);
    } else if (sum < total.damage) {
      skip(
        'unexplained-damage',
        `L${ev.line} ${move}: +${total.damage - sum} not itemised (optional effect)`,
      );
    } else {
      pass('damage-sum', `L${ev.line} ${move} = ${total.damage}`);
    }

    if (ev.type === 'attack' && total && ev.damage !== total.damage) {
      fail('declared-damage', `L${ev.line} ${move}`, total.damage, ev.damage);
    }

    // The core check: bonuses that count cards in the discard.
    for (const e of parts) {
      const m = /^\((\d+)\)\s*cartes? dans la pile de défausse$/i.exec(e.label);
      if (!m) continue;
      const claimed = +m[1];
      const rule = DISCARD_COUNTERS[move];

      if (!rule) {
        skip('discard-counter', `L${ev.line} ${move}: effect not modelled, ${claimed} claimed`);
        continue;
      }
      const snap = snapAtLine.get(ev.line);
      if (!snap) {
        skip('discard-counter', `L${ev.line}: no snapshot`);
        continue;
      }

      const actual = snap.state.players[ev.player as string].discard.filter(
        (c) => c.id === rule.cardId,
      ).length;

      if (actual !== claimed) {
        fail('discard-counter', `L${ev.line} ${move} (${rule.cardId})`, claimed, actual);
      } else if (e.damage !== claimed * rule.per) {
        fail('discard-scale', `L${ev.line} ${move}`, claimed * rule.per, e.damage);
      } else {
        pass('discard-counter', `L${ev.line} ${move}: ${actual} × ${rule.per} = ${e.damage}`);
      }
    }

    // Weakness doubles the damage, so the bonus is exactly half the total.
    // Compared against the TOTAL, not the sum of rows, which can be incomplete.
    const weak = entries.find((e) => /^Faiblesse face au type/i.test(e.label));
    if (weak && total) {
      const before = total.damage - weak.damage;
      if (weak.damage !== before) {
        fail('weakness-x2', `L${ev.line} ${move}`, `+${before} (×2)`, `+${weak.damage}`);
      } else {
        pass('weakness-x2', `L${ev.line} ${before} ×2 = ${total.damage}`);
      }
    }
  }

  /** Cross-checks what we sent to the discard against what the log listed. */
  function validateKnockout(ev: PtcgEvent) {
    const card = ev.card as { id: string; name: string };
    const listed = (ev.children ?? []).find((c) => c.type === 'discard-attached');
    if (!listed?.cards?.length) {
      skip('ko-discard', `L${ev.line} ${card.name}: log lists nothing`);
      return;
    }
    const ours = (ev.discarded as { id: string }[])
      .filter((c) => c.id !== card.id)
      .map((c) => c.id)
      .sort();
    const theirs = listed.cards.map((c) => c.id).sort();
    if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
      fail('ko-discard', `L${ev.line} ${card.name}`, theirs.join(','), ours.join(','));
    } else {
      pass('ko-discard', `L${ev.line} ${card.name}: ${theirs.length} cards`);
    }
  }
}
