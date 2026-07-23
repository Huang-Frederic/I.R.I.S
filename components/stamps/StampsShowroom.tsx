'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { UI_LANGUAGES, type CardLanguage, type CardRarity } from '@/lib/types';
import { RARITY_COLOR } from '@/lib/utils/labels';
import CardZoomModal from '@/components/vinted/CardZoomModal';

export interface StampCard {
  id: string;
  card_name: string;
  pokemon_name: string | null;
  set_name: string | null;
  language: CardLanguage;
  rarity: CardRarity;
  image_url: string | null;
  tcg_image_url: string | null;
}

// Best-first, so the rarity dropdown reads like the app's badges elsewhere.
const RARITIES: CardRarity[] = ['SAR', 'AR', 'SR', 'CHR', 'RR', 'R_HOLO', 'R', 'UC', 'C', 'OTHER'];

const SELECT = 'bg-surface-2 border-border focus:border-red rounded border px-3 py-2 text-sm outline-none';

/**
 * The stamps "binder": a dense, responsive grid of card pockets (3 cols on
 * mobile → up to 8 on wide screens). Search + language + rarity filter the
 * loaded set client-side; hovering a pocket reveals the card's name/rarity.
 */
export default function StampsShowroom({ cards }: { cards: StampCard[] }) {
  const t = useTranslations('stamps');
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState<CardLanguage | 'all'>('all');
  const [rarity, setRarity] = useState<CardRarity | 'all'>('all');
  const [zoomed, setZoomed] = useState<StampCard | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (language !== 'all' && c.language !== language) return false;
      if (rarity !== 'all' && c.rarity !== rarity) return false;
      if (q && !`${c.card_name} ${c.pokemon_name ?? ''} ${c.set_name ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cards, search, language, rarity]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-text-faint pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="bg-surface-2 border-border focus:border-red w-full rounded border py-2 pl-9 pr-3 text-sm outline-none"
          />
        </div>
        <select value={language} onChange={(e) => setLanguage(e.target.value as CardLanguage | 'all')} aria-label={t('language')} className={SELECT}>
          <option value="all">{t('allLanguages')}</option>
          {UI_LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select value={rarity} onChange={(e) => setRarity(e.target.value as CardRarity | 'all')} aria-label={t('rarity')} className={SELECT}>
          <option value="all">{t('allRarities')}</option>
          {RARITIES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <p className="text-text-muted text-xs">{t('count', { shown: filtered.length, total: cards.length })}</p>

      {filtered.length === 0 ? (
        <div className="bg-surface border-border rounded-lg border p-6">
          <p className="text-text-muted text-sm">{cards.length === 0 ? t('empty') : t('emptyFiltered')}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8">
          {filtered.map((c) => {
            const src = c.image_url ?? c.tcg_image_url;
            return (
              <li key={c.id} className="group">
                <button
                  type="button"
                  onClick={() => src && setZoomed(c)}
                  aria-label={c.card_name}
                  className={`border-border bg-surface-2 relative block aspect-[63/88] w-full overflow-hidden rounded-lg border shadow-sm transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md ${src ? 'cursor-zoom-in' : 'cursor-default'}`}
                >
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={c.card_name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="text-text-faint flex h-full items-center justify-center p-2 text-center text-[10px]">{c.card_name}</div>
                  )}
                  {/* Hover reveal — name + rarity + language */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <p className="truncate text-[11px] font-medium text-white">{c.pokemon_name || c.card_name}</p>
                    <p className="text-[10px] text-white/70">
                      <span className={RARITY_COLOR[c.rarity] ?? 'text-white/70'}>{c.rarity}</span>
                      <span> · {c.language}</span>
                    </p>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {zoomed && (zoomed.image_url ?? zoomed.tcg_image_url) && (
        <CardZoomModal
          src={(zoomed.image_url ?? zoomed.tcg_image_url)!}
          alt={zoomed.card_name}
          onClose={() => setZoomed(null)}
        />
      )}
    </div>
  );
}
