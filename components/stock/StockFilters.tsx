'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, PackageCheck, PackageOpen, ChevronDown, CheckSquare, Square } from 'lucide-react';
import { UI_LANGUAGES, type CardLanguage, type CardRarity } from '@/lib/types';

export interface StockFilterState {
  search: string;
  language: CardLanguage | 'all';
  rarity: CardRarity | 'all';
  variant: 'all' | 'standard' | 'pokeball' | 'masterball' | 'reverse_holo' | 'stamp' | 'promo';
  forSaleStatus: 'all' | 'has_for_sale' | 'no_for_sale';
}

export const INITIAL_STOCK_FILTERS: StockFilterState = {
  search: '',
  language: 'all',
  rarity: 'all',
  variant: 'all',
  forSaleStatus: 'all',
};

const LANGUAGES: ReadonlyArray<CardLanguage> = UI_LANGUAGES;
const RARITIES: ReadonlyArray<CardRarity> = ['SAR', 'AR', 'SR', 'CHR', 'RR', 'R_HOLO', 'R', 'UC', 'C', 'OTHER'];
const VARIANT_VALUES = [
  'standard', 'pokeball', 'masterball', 'reverse_holo', 'stamp', 'promo',
] as const;

type VariantKey =
  | 'variantLabel_standard'
  | 'variantLabel_pokeball'
  | 'variantLabel_masterball'
  | 'variantLabel_reverse_holo'
  | 'variantLabel_stamp'
  | 'variantLabel_promo';

interface Props {
  value: StockFilterState;
  onChange: (next: StockFilterState) => void;
  visibleCards: number;
  totalCards: number;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
}

export default function StockFilters({ value, onChange, visibleCards, totalCards, selectionMode, onToggleSelectionMode }: Props) {
  const t = useTranslations('stock');
  const tScanner = useTranslations('scanner');
  const [expanded, setExpanded] = useState(false);

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
        <button
          type="button"
          onClick={onToggleSelectionMode}
          className={`inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs ${
            selectionMode
              ? 'bg-red text-bg'
              : 'bg-surface-2 text-text-muted hover:text-text'
          }`}
          title={selectionMode ? t('selectionCancelTitle') : t('selectionEnableTitle')}
        >
          {selectionMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          {selectionMode ? t('selectionCancel') : t('selectionEnable')}
        </button>
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

        <div className={`${expanded ? 'flex' : 'hidden'} flex-wrap items-center gap-3 md:flex`}>
          <select
            value={value.language}
            onChange={(e) => onChange({ ...value, language: e.target.value as StockFilterState['language'] })}
            className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
            aria-label={t('filterLanguageAria')}
          >
            <option value="all">{t('filterAllLanguages')}</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <select
            value={value.rarity}
            onChange={(e) => onChange({ ...value, rarity: e.target.value as StockFilterState['rarity'] })}
            className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
            aria-label={t('filterRarityAria')}
          >
            <option value="all">{t('filterAllRarities')}</option>
            {RARITIES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select
            value={value.variant}
            onChange={(e) => onChange({ ...value, variant: e.target.value as StockFilterState['variant'] })}
            className="bg-surface-2 border-border rounded border px-3 py-1.5 text-sm"
            aria-label={t('filterVariantAria')}
          >
            <option value="all">{t('filterAllVariants')}</option>
            {VARIANT_VALUES.map((v) => {
              const key: VariantKey = `variantLabel_${v}` as VariantKey;
              return <option key={v} value={v}>{tScanner(key)}</option>;
            })}
          </select>

          <div className="border-border flex overflow-hidden rounded border text-sm">
            {(['all', 'has_for_sale', 'no_for_sale'] as const).map((s) => {
              const active = value.forSaleStatus === s;
              const label = s === 'all' ? t('filterAll') : s === 'has_for_sale' ? t('filterForSale') : t('filterNotForSale');
              const Icon = s === 'has_for_sale' ? PackageCheck : s === 'no_for_sale' ? PackageOpen : null;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ ...value, forSaleStatus: s })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                    active
                      ? 'bg-red-bg text-red font-medium'
                      : 'bg-surface-2 text-text-muted hover:text-text'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-text-muted text-xs">
        {t('filtersCount', { visible: visibleCards, total: totalCards })}
      </p>
    </div>
  );
}
