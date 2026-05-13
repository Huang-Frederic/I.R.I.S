'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import type { EnrichedCard } from '@/lib/types';

/** Form field wrapper with label-above style. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className ? `flex flex-col gap-1.5 ${className}` : 'flex flex-col gap-1.5'}>
      <span className="text-text-muted text-xs font-medium uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

/** Themed text input with disabled-state styling. */
export function Input(props: {
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  min?: number;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={props.type ?? 'text'}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      required={props.required}
      min={props.min}
      max={props.max}
      placeholder={props.placeholder}
      disabled={props.disabled}
      className={`bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${props.disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    />
  );
}

/** Themed select. */
export function Select(props: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
    >
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Modal grid of candidate enriched cards — shown when Strategy 2 / 2.5 returns
 * multiple matches and we need the user to disambiguate visually. Backed by the
 * generic <Modal> primitive (handles Esc, click-outside, scroll lock).
 */
export function CandidatePicker(props: {
  candidates: EnrichedCard[];
  onSelect: (card: EnrichedCard) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations('scanner');
  const tCommon = useTranslations('common');
  return (
    <Modal
      open={true}
      onClose={props.onDismiss}
      ariaLabel={t('candidateModalAria')}
      layout="bottom-sheet"
      backdropClass="bg-background/80 backdrop-blur-sm"
      className="bg-surface border-border flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border sm:rounded-2xl"
    >
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">
          {t('candidateModalTitle', { count: props.candidates.length })}
        </h2>
        <button
          type="button"
          onClick={props.onDismiss}
          className="text-text-muted hover:text-text"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3">
        {props.candidates.map((c, i) => (
          <button
            key={c.cardmarket_id || `${c.card_id_tcg}-${i}`}
            type="button"
            onClick={() => props.onSelect(c)}
            className="border-border hover:border-red group flex flex-col items-center gap-2 rounded-lg border p-2 transition-colors"
          >
            {c.tcg_image_url ? (
              <div className="relative h-40 w-28 overflow-hidden rounded">
                <Image
                  src={c.tcg_image_url}
                  alt={c.card_name}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="bg-surface-2 flex h-40 w-28 items-center justify-center rounded text-xs">
                {tCommon('noImage')}
              </div>
            )}
            <span className="text-text line-clamp-1 text-xs font-medium">{c.card_name}</span>
            <span className="text-text-muted line-clamp-1 text-[11px]">{c.set_name}</span>
            <span className="text-text-faint text-[10px]">{c.set_code} · {c.rarity}</span>
          </button>
        ))}
      </div>

      <div className="border-border border-t px-4 py-3">
        <button
          type="button"
          onClick={props.onDismiss}
          className="border-border text-text-muted hover:bg-surface-2 w-full rounded border py-2 text-sm font-medium"
        >
          {t('candidateNoneFallback')}
        </button>
      </div>
    </Modal>
  );
}
