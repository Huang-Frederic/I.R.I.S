// components/submit/BatchReviewQueue.tsx
'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
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
  requested_status: CardStatus | 'SKIP';
}

interface Props {
  items: QueueItem[];
  onUpdate: (index: number, patch: Partial<QueueItem>) => void;
  onSkip: (index: number) => void;
}

export default function BatchReviewQueue({ items, onUpdate, onSkip }: Props) {
  const [index, setIndex] = useState(0);

  if (items.length === 0) {
    return <p className="text-text-muted text-sm">Aucune carte à valider.</p>;
  }

  const item = items[index];
  const validatedCount = items.filter((i) => i.requested_status !== 'SKIP').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-text-muted text-xs">
          Card {index + 1} / {items.length} ({validatedCount} validées)
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
          <Field label="Card name" value={item.card_name} onChange={(v) => onUpdate(index, { card_name: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Set code" value={item.set_code} onChange={(v) => onUpdate(index, { set_code: v })} />
            <Field label="Set #" value={item.set_number} onChange={(v) => onUpdate(index, { set_number: v })} />
          </div>
          <div className="grid grid-cols-3 gap-2">
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
            <NumberField
              label="Count"
              value={item.count}
              onChange={(v) => onUpdate(index, { count: v })}
            />
          </div>
          <SelectField
            label="Status"
            value={item.requested_status}
            options={['for_sale', 'collection', 'pokedex']}
            onChange={(v) => onUpdate(index, { requested_status: v as CardStatus })}
          />
          <button
            type="button"
            onClick={() => onSkip(index)}
            className="bg-surface-2 hover:bg-surface-off text-red border-border mt-2 inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Skip cette carte
          </button>
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
