// components/ptcg/DrillHome.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Play, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { DrillProfileRow } from '@/lib/types';
import DrillProfileForm from './DrillProfileForm';
import PtcgDrill from './PtcgDrill';
import ConfirmDialog from '@/components/vinted/ConfirmDialog';

// Same community-drawn pixel sprite set as PokemonPicker — see that file for
// why this path (not the smoother default PokeAPI sprite) was picked.
const SPRITE_BASE =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white';

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
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the open row menu on any click outside it.
  useEffect(() => {
    if (!menuOpenId) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId]);

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
              <div className="flex items-center gap-3">
                {p.pokemon_number ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${SPRITE_BASE}/${p.pokemon_number}.png`}
                    alt=""
                    className="pixel-sprite h-12 w-12 shrink-0"
                  />
                ) : (
                  <div className="bg-surface-2 h-12 w-12 shrink-0 rounded-full" />
                )}
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-text-muted text-xs">{t('deckCount', { count: p.cards.length })}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="relative" ref={menuOpenId === p.id ? menuRef : undefined}>
                  <button
                    type="button"
                    onClick={() => setMenuOpenId(menuOpenId === p.id ? null : p.id)}
                    className="border-border hover:bg-surface-2 rounded-lg border p-2"
                    aria-label={t('moreActions')}
                  >
                    <MoreVertical className="h-4 w-4" aria-hidden />
                  </button>
                  {menuOpenId === p.id && (
                    <div className="border-border bg-surface absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-lg border shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpenId(null);
                          setEditing(p);
                          setFormOpen(true);
                        }}
                        className="hover:bg-surface-2 flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> {t('editProfile')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpenId(null);
                          setDeleting(p);
                        }}
                        className="hover:bg-surface-2 text-red flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> {t('deleteProfile')}
                      </button>
                    </div>
                  )}
                </div>
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
