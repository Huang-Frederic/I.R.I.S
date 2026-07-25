/**
 * Resolves battle-log card ids against TCGdex, which is the only free source of
 * gameplay data in French (HP, attacks, abilities, weaknesses).
 *
 * tcg_catalog cannot serve here: it is a collection catalogue and carries only
 * name, rarity, price ids and image. Hence the separate ptcg_cards table.
 *
 * The mapping from the client's internal ids is mechanical but not perfectly
 * regular, so several candidates are tried — and every candidate is checked
 * against the name printed in the log before being accepted. Without that check
 * a lookup can land on a real card that is simply the wrong one: sv10.5b-164 is
 * Majaspic-ex where sv10.5w-164 is Ludvina.
 */

import type { CardLanguage, PtcgCardRef, PtcgCardRow } from '@/lib/types';

const API = 'https://api.tcgdex.net/v2/fr/cards';

/**
 * TCGdex leaves the energy type in English inside its French data
 * (sv03-230 is "Énergie Fire de base"), so names are realigned before comparing.
 */
const TYPE_FR: Record<string, string> = {
  fire: 'feu',
  water: 'eau',
  lightning: 'electrique',
  grass: 'plante',
  psychic: 'psy',
  fighting: 'combat',
  darkness: 'obscurite',
  metal: 'metal',
  fairy: 'fee',
  dragon: 'dragon',
  colorless: 'incolore',
};

/** Accent-, case- and punctuation-insensitive comparison key. */
export function normaliseName(s: string): string {
  let v = (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const [en, fr] of Object.entries(TYPE_FR)) v = v.replace(new RegExp(`\\b${en}\\b`, 'g'), fr);
  return v.replace(/[^a-z0-9]/g, '');
}

/** True when both names denote the same card, ignoring a "de base" suffix. */
export const looseNameMatch = (a: string, b: string) =>
  a === b || a.startsWith(b) || b.startsWith(a);

/**
 * Candidate TCGdex ids for one battle-log id.
 *   sv10_34       -> sv10-034
 *   sv8-5_71      -> sv08.5-071
 *   me2-5_151_ph2 -> me02.5-151
 *   rsv10-5_164   -> sv10.5w-164   ("r" marks a reprint; .5 sets are split w/b)
 */
export function candidateIds(ptcglId: string): string[] {
  const [setRaw, num] = ptcglId.split('_');
  if (!num || !/^\d+$/.test(num)) return [];
  const n3 = num.padStart(3, '0');
  const sets = new Set<string>();

  const norm = (s: string) =>
    s
      .replace(/-(\d)$/, '.$1') // sv8-5 and sv10-5 are half sets: .5 on TCGdex
      .replace(
        /^([a-z]+)(\d+)/,
        (_, alpha: string, digits: string) => alpha + (digits.length === 1 ? `0${digits}` : digits),
      );

  const add = (s: string) => {
    sets.add(s);
    // Half sets are split in two on TCGdex. The same number exists on both
    // sides for different cards, which is why the name check is mandatory.
    if (s.endsWith('.5')) {
      sets.add(`${s}w`);
      sets.add(`${s}b`);
    }
  };

  add(norm(setRaw));
  add(setRaw);
  if (setRaw.startsWith('r')) {
    add(norm(setRaw.slice(1)));
    add(setRaw.slice(1));
  }

  return [...new Set([...sets].flatMap((s) => [`${s}-${n3}`, `${s}-${num}`]))];
}

interface TcgdexCard {
  id: string;
  name: string;
  category: string;
  trainerType?: string;
  stage?: string;
  hp?: number;
  types?: string[];
  weaknesses?: { type: string; value: string }[];
  retreat?: number;
  abilities?: { name: string; effect?: string }[];
  attacks?: { name: string; cost?: string[]; damage?: string | number; effect?: string }[];
  effect?: string;
  image?: string;
}

function toRow(c: TcgdexCard, ptcglId: string, language: CardLanguage): PtcgCardRow {
  const [setCode, setNumber] = c.id.split(/-(?=\d+$)/);
  return {
    ptcgl_id: ptcglId,
    language,
    tcgdex_id: c.id,
    set_code: setCode ?? c.id,
    set_number: setNumber ?? '',
    name: c.name,
    category: c.category,
    trainer_type: c.trainerType ?? null,
    stage: c.stage ?? null,
    hp: c.hp ?? null,
    types: c.types ?? null,
    weaknesses: c.weaknesses ?? null,
    retreat: c.retreat ?? null,
    abilities: (c.abilities ?? []).map((a) => ({ name: a.name, effect: a.effect ?? null })),
    attacks: (c.attacks ?? []).map((a) => ({
      name: a.name,
      cost: a.cost ?? [],
      damage: a.damage != null ? String(a.damage) : null,
      effect: a.effect ?? null,
    })),
    effect: c.effect ?? null,
    image_url: c.image ?? null,
    fetched_at: new Date().toISOString(),
  };
}

async function fetchOne(id: string): Promise<TcgdexCard | null> {
  const res = await fetch(`${API}/${id}`);
  if (!res.ok) return null;
  const d = (await res.json()) as TcgdexCard & { status?: number };
  return d?.id ? d : null;
}

/**
 * Resolves every distinct card seen in a game.
 *
 * `known` lets a caller pass rows already held (ptcg_cards, or a local cache) so
 * only genuinely new cards hit the network. Unresolved ids are returned rather
 * than thrown: a single unknown card should not stop a game from being read.
 */
export async function resolveCards(
  refs: PtcgCardRef[],
  { known = {}, language = 'FR' as CardLanguage } = {},
): Promise<{ cards: Record<string, PtcgCardRow>; unresolved: string[] }> {
  const cards: Record<string, PtcgCardRow> = { ...known };
  const unresolved: string[] = [];

  const wanted = new Map<string, string>();
  for (const r of refs) if (!wanted.has(r.id)) wanted.set(r.id, r.name);

  for (const [id, printedName] of wanted) {
    if (cards[id]) continue;
    const target = normaliseName(printedName);
    const seen: TcgdexCard[] = [];
    let found: TcgdexCard | null = null;

    // Exact name first, then a tolerant pass ("Énergie Eau" vs "… de base").
    // Never accept without checking at all.
    for (const cand of candidateIds(id)) {
      const c = await fetchOne(cand);
      if (!c) continue;
      seen.push(c);
      if (!target || normaliseName(c.name) === target) {
        found = c;
        break;
      }
    }
    if (!found && target) {
      found = seen.find((c) => looseNameMatch(normaliseName(c.name), target)) ?? null;
    }
    if (!found && printedName) {
      const res = await fetch(`${API}?name=${encodeURIComponent(printedName)}`);
      if (res.ok) {
        const list = (await res.json()) as { id: string; name: string }[];
        const hit = (Array.isArray(list) ? list : []).find((c) => normaliseName(c.name) === target);
        if (hit) found = await fetchOne(hit.id);
      }
    }

    if (found) cards[id] = toRow(found, id, language);
    else unresolved.push(id);
  }

  return { cards, unresolved };
}

/** Every distinct card reference appearing anywhere in a parsed game. */
export function collectCardRefs(state: { snapshots: { event: unknown }[] }): PtcgCardRef[] {
  const out = new Map<string, string>();
  const scan = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    if (typeof rec.id === 'string' && typeof rec.name === 'string' && !out.has(rec.id)) {
      out.set(rec.id, rec.name);
    }
    if (typeof rec.cardId === 'string' && typeof rec.name === 'string' && !out.has(rec.cardId)) {
      out.set(rec.cardId, rec.name);
    }
    for (const v of Object.values(rec)) scan(v);
  };
  scan(state.snapshots);
  return [...out].map(([id, name]) => ({ id, name }));
}
