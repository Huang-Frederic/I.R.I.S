// components/ptcg/DrillHome.tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Play, Pencil, Trash2 } from 'lucide-react';
import type { DrillProfileRow } from '@/lib/types';
import DrillProfileForm from './DrillProfileForm';
import PtcgDrill from './PtcgDrill';
import ConfirmDialog from '@/components/vinted/ConfirmDialog';

export default function DrillHome({ initialProfiles }: { initialProfiles: DrillProfileRow[] }) {
  const t = useTranslations('drill');
  const [profiles, setProfiles] = useState(initialProfiles);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DrillProfileRow | null>(null);
  const [deleting, setDeleting] = useState<DrillProfileRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [running, setRunning] = useState<{ profile: DrillProfileRow; images: Record<string, string> } | null>(
    null,
  );

  async function handleStart(profile: DrillProfileRow) {
    setStarting(profile.id);
    try {
      const res = await fetch(`/api/ptcg/drill-profiles/${profile.id}`);
      if (!res.ok) return;
      const json = (await res.json()) as { profile: DrillProfileRow; images: Record<string, string> };
      setRunning(json);
    } finally {
      setStarting(null);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/ptcg/drill-profiles/${deleting.id}`, { method: 'DELETE' });
      if (res.ok) setProfiles((prev) => prev.filter((p) => p.id !== deleting.id));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  if (running) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setRunning(null)}
          className="text-text-muted hover:text-text self-start text-xs font-semibold"
        >
          {t('backToProfiles')}
        </button>
        <PtcgDrill images={running.images} cards={running.profile.cards} targetIds={running.profile.target_ids} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => {
          setEditing(null);
          setFormOpen(true);
        }}
        className="bg-red flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:opacity-90"
      >
        <Plus className="h-4 w-4" aria-hidden /> {t('newProfile')}
      </button>

      {profiles.length === 0 ? (
        <p className="text-text-muted border-border bg-surface rounded-xl border p-4 text-sm">
          {t('noProfiles')}
        </p>
      ) : (
        <ul className="divide-border border-border bg-surface divide-y rounded-xl border">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-text-muted text-xs">{t('deckCount', { count: p.cards.length })}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(p);
                    setFormOpen(true);
                  }}
                  className="border-border hover:bg-surface-2 rounded-lg border p-2"
                  aria-label={t('editProfile')}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleting(p)}
                  className="border-border hover:bg-surface-2 rounded-lg border p-2"
                  aria-label={t('deleteProfile')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void handleStart(p)}
                  disabled={starting === p.id}
                  className="bg-red flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden /> {t('startDrill')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DrillProfileForm
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(saved) => {
          setProfiles((prev) => {
            const exists = prev.some((p) => p.id === saved.id);
            return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev];
          });
          setFormOpen(false);
        }}
      />

      {deleting && (
        <ConfirmDialog
          title={t('deleteProfileTitle')}
          body={t('deleteProfileBody', { name: deleting.name })}
          confirmLabel={t('deleteProfile')}
          confirmTone="danger"
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setDeleting(null)}
          busy={deleteBusy}
        />
      )}
    </div>
  );
}
