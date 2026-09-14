// components/ptcg/DrillProfileForm.tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/Modal';
import { decklistTextFromCards } from '@/lib/ptcg/decklist';
import type { DrillCard, DrillCategory, DrillProfileRow } from '@/lib/types';

const CATEGORIES: DrillCategory[] = ['poke', 'trainer', 'energy'];

interface Props {
  open: boolean;
  editing: DrillProfileRow | null;
  onClose: () => void;
  onSaved: (profile: DrillProfileRow) => void;
}

export default function DrillProfileForm({ open, editing, onClose, onSaved }: Props) {
  const t = useTranslations('drill');
  const tCommon = useTranslations('common');

  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [cards, setCards] = useState<DrillCard[]>([]);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set());
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset/prefill whenever the modal opens for a different profile (or a
  // fresh "New Profile".
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      if (editing) {
        setText(decklistTextFromCards(editing.cards));
        setName(editing.name);
        setCards(editing.cards);
        setTargetIds(new Set(editing.target_ids));
      } else {
        setText('');
        setName('');
        setCards([]);
        setTargetIds(new Set());
      }
      setUnresolved([]);
      setError(null);
    }, 0);
    return () => clearTimeout(id);
  }, [open, editing]);

  async function handleParse() {
    setParsing(true);
    setError(null);
    try {
      const res = await fetch('/api/ptcg/drill-profiles/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        cards?: DrillCard[];
        unresolved?: string[];
        message?: string;
      };
      if (!res.ok) {
        setError(body.message ?? tCommon('errorUnknown'));
        return;
      }
      setCards(body.cards ?? []);
      setUnresolved(body.unresolved ?? []);
      // Re-analysing replaces the whole list; carry over checks only for
      // cards that still exist under the same id.
      setTargetIds((prev) => {
        const ids = new Set((body.cards ?? []).map((c) => c.id));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
    } finally {
      setParsing(false);
    }
  }

  function toggleTarget(id: string) {
    setTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), cards, target_ids: [...targetIds] };
      const res = await fetch(
        editing ? `/api/ptcg/drill-profiles/${editing.id}` : '/api/ptcg/drill-profiles',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { profile?: DrillProfileRow; message?: string };
      if (!res.ok || !json.profile) {
        setError(json.message ?? tCommon('errorUnknown'));
        return;
      }
      onSaved(json.profile);
    } finally {
      setSaving(false);
    }
  }

  const canSave = name.trim().length > 0 && cards.length > 0 && targetIds.size > 0 && !saving;

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel={editing ? t('editProfileTitle') : t('newProfile')}
      layout="bottom-sheet"
      className="bg-surface border-border flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border"
    >
      <div className="border-border flex items-start justify-between gap-3 border-b p-4">
        <h2 className="text-base font-bold">{editing ? t('editProfileTitle') : t('newProfile')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={tCommon('close')}
          className="text-text-muted hover:text-text hover:bg-surface-2 -m-1 shrink-0 rounded-lg p-1.5 transition"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          <label className="text-text-muted text-xs font-semibold uppercase tracking-wide">
            {t('pasteDecklistLabel')}
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none"
          />
          <button
            type="button"
            onClick={() => void handleParse()}
            disabled={parsing || !text.trim()}
            className="border-border hover:bg-surface-2 self-start rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {parsing ? tCommon('loading') : t('parseDecklist')}
          </button>
        </div>

        {error && <p className="text-red text-sm">{error}</p>}

        {cards.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-text-muted text-xs font-semibold uppercase tracking-wide">
              {t('selectTargetsLabel')}
            </p>
            {CATEGORIES.map((category) => {
              const list = cards.filter((c) => c.category === category);
              if (list.length === 0) return null;
              return (
                <div key={category} className="flex flex-col gap-1.5">
                  <p className="text-text-faint text-[11px] uppercase tracking-wide">
                    {t(`cat_${category}`)}
                  </p>
                  {list.map((c) => {
                    const isUnresolved = unresolved.some((u) => u.startsWith(c.name));
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={targetIds.has(c.id)}
                          onChange={() => toggleTarget(c.id)}
                        />
                        <span>
                          {c.count}× {c.name}
                        </span>
                        {isUnresolved && (
                          <span className="text-text-faint text-[11px]">{t('unresolvedWarning')}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {cards.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-text-muted text-xs font-semibold uppercase tracking-wide">
              {t('profileNameLabel')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('profileNamePlaceholder')}
              className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none"
            />
          </div>
        )}
      </div>

      <div className="border-border flex justify-end gap-2 border-t p-4">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="border-border hover:bg-surface-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="bg-red rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? tCommon('loading') : tCommon('save')}
        </button>
      </div>
    </Modal>
  );
}
