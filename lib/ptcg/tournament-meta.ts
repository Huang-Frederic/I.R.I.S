import { Monitor, MapPin, Swords, Trophy, Map, Plane, Globe2, type LucideIcon } from 'lucide-react';
import type { PtcgTournamentCategory, PtcgTournamentPlacement } from '@/lib/types';

export interface CategoryOption {
  value: PtcgTournamentCategory;
  icon: LucideIcon;
  labelKey:
    | 'category_online'
    | 'category_locals'
    | 'category_challenge'
    | 'category_cup'
    | 'category_regionals'
    | 'category_internationals'
    | 'category_worlds';
}

/** Same order as the DB check constraint and the reference app's own
 *  category dropdown (supabase/migrations/20260916224727_ptcg_tournaments.sql). */
export const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'online', icon: Monitor, labelKey: 'category_online' },
  { value: 'locals', icon: MapPin, labelKey: 'category_locals' },
  { value: 'challenge', icon: Swords, labelKey: 'category_challenge' },
  { value: 'cup', icon: Trophy, labelKey: 'category_cup' },
  { value: 'regionals', icon: Map, labelKey: 'category_regionals' },
  { value: 'internationals', icon: Plane, labelKey: 'category_internationals' },
  { value: 'worlds', icon: Globe2, labelKey: 'category_worlds' },
];

export interface PlacementOption {
  value: PtcgTournamentPlacement;
  labelKey: string;
}

/** Broadest field cut first, most exclusive last — matches the reference
 *  app's dropdown order, NOT the DB check constraint's declaration order. */
export const PLACEMENT_OPTIONS: PlacementOption[] = [
  { value: 'no_placement', labelKey: 'placement_no_placement' },
  { value: 'dropped', labelKey: 'placement_dropped' },
  { value: 'top_1024', labelKey: 'placement_top_1024' },
  { value: 'top_512', labelKey: 'placement_top_512' },
  { value: 'top_256', labelKey: 'placement_top_256' },
  { value: 'top_128', labelKey: 'placement_top_128' },
  { value: 'top_64', labelKey: 'placement_top_64' },
  { value: 'top_32', labelKey: 'placement_top_32' },
  { value: 'top_16', labelKey: 'placement_top_16' },
  { value: 'top_8', labelKey: 'placement_top_8' },
  { value: 'top_4', labelKey: 'placement_top_4' },
  { value: 'top_2', labelKey: 'placement_top_2' },
  { value: 'winner', labelKey: 'placement_winner' },
];
