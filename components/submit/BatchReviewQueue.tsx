// components/submit/BatchReviewQueue.tsx
'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CardLanguage, CardCondition, CardRarity, CardStatus } from '@/lib/types';

export interface QueueItem {
  filename: string;
  photoPreviewUrl: string;
  card_name: string;
  pokemon_name: string;
  pokemon_number: number | null;
  set_code: string;
  set_number: string;
  language: CardLanguage;
  rarity: CardRarity;
  condition: CardCondition;
  variant: string;
  count: number;
  requested_status: CardStatus;
}

interface Props {
  items: QueueItem[];
  onUpdate: (index: number, patch: Partial<QueueItem>) => void;
  registeredPokedex: Set<number>;
  onIndexReached?: (index: number) => void;
}

export default function BatchReviewQueue({ items, onUpdate, registeredPokedex, onIndexReached }: Props) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    onIndexReached?.(index);
  }, [index, onIndexReached]);

  if (items.length === 0) {
    return <p className="text-text-muted text-sm">Aucune carte à valider.</p>;
  }

  const item = items[index];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-text-muted text-xs">
          Card {index + 1} / {items.length}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Précédent"
            className="bg-surface-2 disabled:opacity-30 rounded p-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
            disabled={index === items.length - 1}
            aria-label="Suivant"
            className="bg-surface-2 disabled:opacity-30 rounded p-1.5"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.photoPreviewUrl} alt={item.filename} className="w-full rounded" />
          <p className="text-text-faint mt-1 text-xs">{item.filename}</p>
        </div>

        <div className="space-y-2">
          {item.pokemon_number !== null && registeredPokedex.has(item.pokemon_number) && (
            <div className="bg-rarity-ar/20 text-rarity-ar mb-2 flex items-center gap-2 rounded px-3 py-2 text-xs">
              <span>⚠️ Ce Pokémon est déjà dans le Pokédex (#{item.pokemon_number}). Choisis Stock ou Vinted (pas Pokédex).</span>
            </div>
          )}
          <Field label="Card name" value={item.card_name} onChange={(v) => onUpdate(index, { card_name: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Set code" value={item.set_code} onChange={(v) => onUpdate(index, { set_code: v })} />
            <Field label="Set #" value={item.set_number} onChange={(v) => onUpdate(index, { set_number: v })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Langue"
              value={item.language}
              options={['JP', 'EN', 'FR', 'KO', 'ZH']}
              onChange={(v) => onUpdate(index, { language: v as CardLanguage })}
            />
            <SelectField
              label="Cond."
              value={item.condition}
              options={['NM', 'EX', 'GD', 'PL', 'PO']}
              onChange={(v) => onUpdate(index, { condition: v as CardCondition })}
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <SelectField
                label="Status"
                value={item.requested_status}
                options={['for_sale', 'collection', 'pokedex']}
                onChange={(v) => onUpdate(index, { requested_status: v as CardStatus })}
              />
            </div>
            <div className="w-20">
              <NumberField
                label="Count"
                value={item.count}
                onChange={(v) => onUpdate(index, { count: v })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-text-muted text-xs">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-text-muted text-xs">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-text-muted text-xs">{label}</span>
      <input
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}
