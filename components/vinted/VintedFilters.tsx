'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, Globe, GlobeLock, Tag, RefreshCw, CheckSquare, Square, User, ChevronDown } from 'lucide-react';
import { UI_LANGUAGES, type CardLanguage, type CardRarity } from '@/lib/types';
import { type MultiUserChip } from '@/lib/utils/vinted-filter';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { chipClassesForColor, colorForUserName } from '@/lib/utils/user-colors';

export interface VintedFilterState {
  search: string;
  language: CardLanguage | 'all';
  rarity: CardRarity | 'all';
  variant: 'all' | 'standard' | 'pokeball' | 'masterball' | 'reverse_holo' | 'stamp' | 'promo';
  /** Type of listings to show: all (cards+lots), cards only, or lots only. */
  kindFilter: 'all' | 'cards' | 'lots';
  // Cumulative chips
  showOnline: boolean;     // include for_sale where I have a listing (fresh)
  showOffline: boolean;    // include for_sale where I have no listing
  showSold: boolean;       // include sold cards (individual rows)
  showStale: boolean;      // restrict to "à rafraîchir" (>21j)
  multiUserChip: MultiUserChip;
}

export const INITIAL_FILTERS: VintedFilterState = {
  search: '',
  language: 'all',
  rarity: 'all',
  variant: 'all',
  kindFilter: 'all',
  showOnline: false,
  showOffline: false,
  showSold: false,
  showStale: false,
  multiUserChip: 'all',
};

const LANGUAGES: ReadonlyArray<CardLanguage> = UI_LANGUAGES;
const RARITIES: ReadonlyArray<CardRarity> = ['SAR', 'AR', 'SR', 'CHR', 'RR', 'R_HOLO', 'R', 'UC', 'C', 'OTHER'];
const VARIANTS = [
  { value: 'standard' as const, label: 'Standard' },
  { value: 'pokeball' as const, label: 'Poké Ball' },
  { value: 'masterball' as const, label: 'Master Ball' },
  { value: 'reverse_holo' as const, label: 'Reverse Holo' },
  { value: 'stamp' as const, label: 'Stamp' },
  { value: 'promo' as const, label: 'Promo' },
];

interface Props {
  value: VintedFilterState;
  onChange: (next: VintedFilterState) => void;
  visibleCards: number;
  totalCards: number;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  hasPartner: boolean;
}

type ChipKey = 'showOnline' | 'showOffline' | 'showSold' | 'showStale';
interface Chip {
  key: ChipKey;
  labelKey: 'chipOnline' | 'chipOffline' | 'chipSold' | 'chipStale';
  icon: React.ComponentType<{ className?: string }>;
}

const CHIPS: Chip[] = [
  { key: 'showOnline', labelKey: 'chipOnline', icon: Globe },
  { key: 'showOffline', labelKey: 'chipOffline', icon: GlobeLock },
  { key: 'showSold', labelKey: 'chipSold', icon: Tag },
  { key: 'showStale', labelKey: 'chipStale', icon: RefreshCw },
];

export default function VintedFilters({ value, onChange, visibleCards, totalCards, selectionMode, onToggleSelectionMode, hasPartner }: Props) {
  const [expanded, setExpanded] = useState(false);
  const t = useTranslations('vinted');
  // Per design: my own chip is the default tint ('Moi'); only the partner
  // chip is colored by their identity. From my POV I'm always 'Moi', never
  // my own display name.
  const { partnerName } = useUserContext();
  const partnerColor = colorForUserName(partnerName);
  const toggleChip = (key: ChipKey) => onChange({ ...value, [key]: !value[key] });

  return (
    <div className="bg-bg sticky top-0 z-10 -mx-4 mb-4 flex flex-col gap-3 px-4 py-3 md:mx-0 md:px-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="text-text-faint pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
          <input
            type="search"
            placeholder={t('filtersSearchPlaceholder')}
            value={value.search}
            onChange={(e) => onChange({ ...value, search: e.target.value })}
            className="bg-surface-2 border-border focus:border-red w-full rounded border py-1.5 pl-8 pr-3 text-sm outline-none"
          />
        </div>
        {/* Mobile filter toggle — desktop keeps the inline selects always visible. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="bg-surface-2 border-border text-text-muted inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs md:hidden"
        >
          {t('filtersToggle')}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>

        {/* Selects: hidden on mobile when collapsed; always visible on md+. */}
        <div className={`${expanded ? 'flex' : 'hidden'} flex-wrap items-center gap-3 md:flex`}>
          <select
            value={value.language}
            onChange={(e) => onChange({ ...value, language: e.target.value as VintedFilterState['language'] })}
            className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
            aria-label={t('filterLanguageAria')}
          >
            <option value="all">{t('filterAllLanguages')}</option>
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>

          <select
            value={value.rarity}
            onChange={(e) => onChange({ ...value, rarity: e.target.value as VintedFilterState['rarity'] })}
            className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
            aria-label={t('filterRarityAria')}
          >
            <option value="all">{t('filterAllRarities')}</option>
            {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          <select
            value={value.variant}
            onChange={(e) => onChange({ ...value, variant: e.target.value as VintedFilterState['variant'] })}
            className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
            aria-label={t('filterVariantAria')}
          >
            <option value="all">{t('filterAllVariants')}</option>
            {VARIANTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div className={`${expanded ? 'flex' : 'hidden'} flex-col gap-3 md:flex`}>
        <div className="flex items-center gap-1">
          <span className="text-text-faint mr-1 text-xs">{t('typeLabel')}</span>
          {(['all', 'cards', 'lots'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange({ ...value, kindFilter: k })}
              className={`rounded px-2 py-1 text-xs ${
                value.kindFilter === k
                  ? 'bg-red text-bg'
                  : 'bg-surface-2 text-text-muted hover:text-text'
              }`}
            >
              {k === 'all' ? t('typeAll') : k === 'cards' ? t('typeCards') : t('typeLots')}
            </button>
          ))}
          <button
            type="button"
            onClick={onToggleSelectionMode}
            className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs ${
              selectionMode
                ? 'bg-red text-bg'
                : 'bg-surface-2 text-text-muted hover:text-text'
            }`}
            title={selectionMode ? t('selectionCancelTitle') : t('selectionEnableTitle')}
          >
            {selectionMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            {selectionMode ? t('selectionCancel') : t('selectionEnable')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {CHIPS.map(({ key, labelKey, icon: Icon }) => {
            const active = value[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleChip(key)}
                className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
                  active
                    ? 'bg-red-bg border-red text-red font-medium'
                    : 'bg-surface-2 border-border text-text-muted hover:text-text'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(labelKey)}
              </button>
            );
          })}
        </div>

        <p className="text-text-muted text-xs">
          {t('chipsCount', { visible: visibleCards, total: totalCards })}
        </p>

        <div className="border-border my-1 border-t" />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...value, multiUserChip: 'all' })}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
              value.multiUserChip === 'all'
                ? 'bg-red-bg border-red text-red font-medium'
                : 'bg-surface-2 border-border text-text-muted hover:text-text'
            }`}
          >
            {t('userAll')}
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...value, multiUserChip: 'mine' })}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${chipClassesForColor('neutral', value.multiUserChip === 'mine')}`}
          >
            <User className="h-3.5 w-3.5" />
            {t('userMine')}
          </button>
          {hasPartner && partnerName && (
            <button
              type="button"
              onClick={() => onChange({ ...value, multiUserChip: 'partner' })}
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${chipClassesForColor(partnerColor, value.multiUserChip === 'partner')}`}
            >
              <User className="h-3.5 w-3.5" />
              {t('userPartner', { name: partnerName })}
            </button>
          )}
          {hasPartner && (
            <button
              type="button"
              onClick={() => onChange({ ...value, multiUserChip: 'cross' })}
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
                value.multiUserChip === 'cross'
                  ? 'bg-red-bg border-red text-red font-medium'
                  : 'bg-surface-2 border-border text-text-muted hover:text-text'
              }`}
            >
              {t('userCross')}
            </button>
          )}
          <button
            type="button"
            onClick={() => onChange({ ...value, multiUserChip: 'none' })}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
              value.multiUserChip === 'none'
                ? 'bg-red-bg border-red text-red font-medium'
                : 'bg-surface-2 border-border text-text-muted hover:text-text'
            }`}
          >
            {t('userNone')}
          </button>
          {hasPartner && (
            <button
              type="button"
              onClick={() => onChange({ ...value, multiUserChip: 'to_delete' })}
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs transition-colors ${
                value.multiUserChip === 'to_delete'
                  ? 'bg-red-bg border-red text-red font-medium'
                  : 'bg-surface-2 border-border text-text-muted hover:text-text'
              }`}
            >
              {t('userToDelete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
