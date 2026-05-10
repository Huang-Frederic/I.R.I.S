'use client';

import { Sparkles, BookOpen, Tag } from 'lucide-react';
import type { SuggestionResult } from '@/lib/utils/pokedex-suggestion';
import { displayCardName } from '@/lib/utils/format-name';

interface ScanSuggestionProps {
  result: SuggestionResult;
}

/**
 * Visual pill that summarises what the suggestion engine recommends.
 * The icon and accent vary so the user can read the recommendation
 * at a glance without parsing the whole sentence.
 */
export default function ScanSuggestion({ result }: ScanSuggestionProps) {
  const tone = TONES[result.type];
  const Icon = tone.icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${tone.classes}`}
      role="status"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1">
        <p>{result.message}</p>
        {result.existingCard && (
          <p className="text-text-faint text-xs font-mono">
            Existante : {displayCardName(result.existingCard)} · {result.existingCard.set_code}{' '}
            {result.existingCard.set_number}
          </p>
        )}
      </div>
    </div>
  );
}

const TONES: Record<
  SuggestionResult['type'],
  { icon: typeof Sparkles; classes: string }
> = {
  no_pokemon_number: {
    icon: Tag,
    classes: 'border-border bg-surface-2 text-text-muted',
  },
  no_entry: {
    icon: BookOpen,
    classes: 'border-rarity-r bg-rarity-r/10 text-rarity-r',
  },
  can_replace: {
    icon: Sparkles,
    classes: 'border-rarity-ar bg-rarity-ar/10 text-rarity-ar',
  },
  keep_existing: {
    icon: Tag,
    classes: 'border-border bg-surface-2 text-text-muted',
  },
};
