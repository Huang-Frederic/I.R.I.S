/**
 * The exact 60 cards of Frédéric's paper Typhlosion list, keyed by PTCG Live
 * ids so the drill can pull real card images from ptcg_cards (same cache the
 * replay uses). Labels are the French names as they appear in battle logs —
 * update this file when the list changes.
 *
 * Paper ↔ Live set mapping used here: DRI=sv10 · TWM=sv6 · SSP=sv8 · OBF=sv3 ·
 * JTG=sv9 · MEG=me1 · ASC=me2-5 · POR=me3 · CRI=me4 · PBL=me5.
 */

export type DrillCategory = 'poke' | 'trainer' | 'energy';

export interface DrillCard {
  /** ptcgl_id, joins ptcg_cards for the image. */
  id: string;
  /** Display name (battle-log French). */
  name: string;
  count: number;
  category: DrillCategory;
}

export const DRILL_DECK: DrillCard[] = [
  // Pokémon (21)
  { id: 'sv10_32', name: 'Héricendre de Luth', count: 4, category: 'poke' },
  { id: 'sv10_33', name: 'Feurisson de Luth', count: 4, category: 'poke' },
  { id: 'sv10_34', name: 'Typhlosion de Luth', count: 3, category: 'poke' },
  { id: 'me2-5_247', name: 'Fantyrm', count: 3, category: 'poke' },
  { id: 'me2-5_248', name: 'Dispareptil', count: 2, category: 'poke' },
  { id: 'sv8_21', name: 'Victini', count: 2, category: 'poke' },
  { id: 'sv10_185', name: 'Shaymin', count: 1, category: 'poke' },
  { id: 'me2-5_288', name: 'Favianos-ex', count: 1, category: 'poke' },
  { id: 'me2-5_39', name: 'Psykokwak', count: 1, category: 'poke' },
  // Dresseurs (34)
  { id: 'me2-5_264', name: 'Hyper Ball', count: 4, category: 'trainer' },
  { id: 'sv10_221', name: 'Aventure de Luth', count: 4, category: 'trainer' },
  { id: 'me3_113', name: 'Poké Registre', count: 4, category: 'trainer' },
  { id: 'me1_167', name: 'Poffin Copain-Copain', count: 3, category: 'trainer' },
  { id: 'me1_169', name: 'Détermination de Lilie', count: 3, category: 'trainer' },
  { id: 'me1_173', name: 'Civière Nocturne', count: 2, category: 'trainer' },
  { id: 'me2-5_256', name: 'Ordres du Boss', count: 2, category: 'trainer' },
  { id: 'sv8_250', name: 'Montagne Gravité', count: 2, category: 'trainer' },
  { id: 'me1_175', name: 'Super Bonbon', count: 2, category: 'trainer' },
  // rsv10-5_80 plutôt que le print Pitch Black (me5_104) : TCGdex n'a pas
  // encore son image (HTTP 404), celle-ci vient des parties importées.
  { id: 'rsv10-5_80', name: 'Bracelet Vaillant', count: 2, category: 'trainer' },
  { id: 'sv9_156', name: 'Billet à Échanger', count: 1, category: 'trainer' },
  { id: 'me4_113', name: 'Carton Rouge Spécial', count: 1, category: 'trainer' },
  { id: 'sv6_163', name: 'Boîte à Secrets', count: 1, category: 'trainer' },
  { id: 'sv6_206', name: 'Kassis', count: 1, category: 'trainer' },
  { id: 'sv6_207', name: 'Soutien de Néphie', count: 1, category: 'trainer' },
  { id: 'sv10_168', name: 'Cendre Sacrée', count: 1, category: 'trainer' },
  // Énergie (5)
  { id: 'sv3_230', name: 'Énergie Feu', count: 5, category: 'energy' },
];

/** The counts the drill asks for — Yasmin's P1 list, in scan order. The
 *  recovery trio (Cendre, Civière, Néphie) is deliberately out for now:
 *  Frédéric trains the core seven first and will add them back later. */
export const DRILL_TARGET_IDS: string[] = [
  'sv10_32', // Héricendre
  'sv10_33', // Feurisson
  'sv10_34', // Typhlosion
  'sv10_221', // Aventure de Luth
  'sv3_230', // Énergie
  'sv9_156', // Billet à Échanger
  'sv6_163', // Boîte à Secrets
];
