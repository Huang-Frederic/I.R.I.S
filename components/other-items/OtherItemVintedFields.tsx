'use client';

import { useEffect, useId } from 'react';
import { useTranslations } from 'next-intl';
import {
  DEFAULT_CONDITION_ID,
  MAX_COLORS,
  VINTED_COLORS,
  conditionIdsFor,
  findSizeOption,
  type MissingAttribute,
} from '@/lib/vinted/other-item-attributes';
import type { CatalogAttributesState } from './hooks/useCatalogAttributes';

export interface VintedFieldsPatch {
  conditionId?: number;
  sizeId?: number | null;
  /** The picked size option's label, stored as `other_items.size` for the description. */
  sizeLabel?: string | null;
  colorIds?: number[];
}

export interface VintedFieldsProps {
  attributes: CatalogAttributesState;
  onRetry: () => void;
  conditionId: number;
  sizeId: number | null;
  colorIds: number[];
  onChange: (patch: VintedFieldsPatch) => void;
  /** Fields to flag as still missing (shown after a submit attempt). */
  missing?: MissingAttribute[];
}

const CONDITION_LABEL_KEYS: Record<
  number,
  'conditionNewWithTag' | 'conditionNewWithoutTag' | 'conditionVeryGood' | 'conditionGood' | 'conditionSatisfactory'
> = {
  6: 'conditionNewWithTag',
  1: 'conditionNewWithoutTag',
  2: 'conditionVeryGood',
  3: 'conditionGood',
  4: 'conditionSatisfactory',
};

const FIELD_CLASSES =
  'bg-surface-2 border-border focus:border-red mt-1 w-full rounded border px-3 py-2 text-sm outline-none';

/**
 * The listing attributes Vinted asks for in the item's category: its accepted
 * conditions, its size options (grouped as Vinted groups them) and colors.
 * Shared by the creation form and the fiche. Values the category doesn't
 * accept (after a category change, or a stale stored value) are corrected on
 * the spot — the bot would refuse to post them anyway.
 */
export default function OtherItemVintedFields({
  attributes,
  onRetry,
  conditionId,
  sizeId,
  colorIds,
  onChange,
  missing = [],
}: VintedFieldsProps) {
  const t = useTranslations('otherItems');
  const conditionSelectId = useId();
  const sizeSelectId = useId();
  const ready = attributes.status === 'ready' ? attributes.attributes : null;
  const conditionIds = conditionIdsFor(ready);

  useEffect(() => {
    if (!ready) return;
    const accepted = conditionIdsFor(ready);
    if (accepted.length > 0 && !accepted.includes(conditionId)) {
      onChange({ conditionId: accepted.includes(DEFAULT_CONDITION_ID) ? DEFAULT_CONDITION_ID : accepted[0] });
    }
  }, [ready, conditionId, onChange]);

  useEffect(() => {
    if (ready && sizeId !== null && !findSizeOption(ready, sizeId)) onChange({ sizeId: null, sizeLabel: null });
  }, [ready, sizeId, onChange]);

  useEffect(() => {
    if (ready && !ready.has_color && colorIds.length > 0) onChange({ colorIds: [] });
  }, [ready, colorIds, onChange]);

  function conditionLabel(id: number): string {
    const key = CONDITION_LABEL_KEYS[id];
    if (key) return t(key);
    return ready?.condition_options.find((o) => o.id === id)?.title ?? `#${id}`;
  }

  function toggleColor(id: number) {
    if (colorIds.includes(id)) onChange({ colorIds: colorIds.filter((c) => c !== id) });
    else if (colorIds.length < MAX_COLORS) onChange({ colorIds: [...colorIds, id] });
  }

  const showColors = !(ready && !ready.has_color);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={conditionSelectId} className="text-text-muted text-xs">
            {t('conditionLabel')}
          </label>
          <select
            id={conditionSelectId}
            value={conditionId}
            onChange={(e) => onChange({ conditionId: Number(e.target.value) })}
            className={FIELD_CLASSES}
          >
            {conditionIds.map((id) => (
              <option key={id} value={id}>
                {conditionLabel(id)}
              </option>
            ))}
          </select>
          {missing.includes('condition') && <p className="text-red mt-1 text-xs">{t('errorCondition')}</p>}
        </div>

        {ready?.size_options && (
          <div>
            <label htmlFor={sizeSelectId} className="text-text-muted text-xs">
              {t('sizeLabel')}
            </label>
            <select
              id={sizeSelectId}
              value={sizeId ?? ''}
              onChange={(e) => {
                const option = findSizeOption(ready, e.target.value === '' ? null : Number(e.target.value));
                onChange({ sizeId: option?.id ?? null, sizeLabel: option?.title ?? null });
              }}
              className={`${FIELD_CLASSES} ${missing.includes('size') ? 'border-red' : ''}`}
            >
              <option value="">{t('sizeSelectPlaceholder')}</option>
              {ready.size_options.map((group, i) =>
                group.title ? (
                  <optgroup key={i} label={group.title}>
                    {group.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.title}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  group.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))
                ),
              )}
            </select>
            {missing.includes('size') && <p className="text-red mt-1 text-xs">{t('errorSize')}</p>}
          </div>
        )}
      </div>

      {attributes.status === 'loading' && <p className="text-text-muted text-xs">{t('attributesLoading')}</p>}
      {attributes.status === 'waiting_bot' && <p className="text-text-muted text-xs">{t('attributesWaitingBot')}</p>}
      {attributes.status === 'error' && (
        <p className="text-red text-xs">
          {t('attributesError', { message: attributes.message })}{' '}
          <button type="button" onClick={onRetry} className="underline">
            {t('attributesRetry')}
          </button>
        </p>
      )}

      {showColors && (
        <div>
          <span className="text-text-muted text-xs">{t('colorLabel')}</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {VINTED_COLORS.map((color) => {
              const selected = colorIds.includes(color.id);
              return (
                <button
                  key={color.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={color.title}
                  title={color.title}
                  onClick={() => toggleColor(color.id)}
                  className={`h-7 w-7 rounded-full border ${
                    selected ? 'border-red ring-red ring-2 ring-offset-1' : 'border-border'
                  }`}
                  style={{ backgroundColor: `#${color.hex}` }}
                />
              );
            })}
          </div>
          {colorIds.length > 0 && (
            <p className="text-text-muted mt-1 text-xs">
              {colorIds.map((id) => VINTED_COLORS.find((c) => c.id === id)?.title).join(', ')}
            </p>
          )}
          {missing.includes('color') && <p className="text-red mt-1 text-xs">{t('errorColor')}</p>}
        </div>
      )}
    </div>
  );
}
