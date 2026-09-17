'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/Modal';
import DeckSlots from './DeckSlots';
import CategorySelect from './CategorySelect';
import { PLACEMENT_OPTIONS } from '@/lib/ptcg/tournament-meta';
import type { PtcgTournamentCategory, PtcgTournamentPlacement, PtcgTournamentRow } from '@/lib/types';

interface CreateProps {
  mode: 'create';
  open: boolean;
  onClose: () => void;
  onSaved: (tournament: PtcgTournamentRow) => void;
}

interface EditProps {
  mode: 'edit';
  open: boolean;
  onClose: () => void;
  tournament: PtcgTournamentRow;
  onSaved: (tournament: PtcgTournamentRow) => void;
}

type Props = CreateProps | EditProps;

export default function TournamentModal(props: Props) {
  const t = useTranslations('ptcg');
  const tCommon = useTranslations('common');
  const initial = props.mode === 'edit' ? props.tournament : null;
  const [name, setName] = useState(initial?.name ?? '');
  const [playedAt, setPlayedAt] = useState(initial?.played_at ?? new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<PtcgTournamentCategory>(initial?.category ?? 'online');
  const [bestOf, setBestOf] = useState<1 | 3>(initial?.best_of ?? 1);
  const [placement, setPlacement] = useState<PtcgTournamentPlacement>(initial?.placement ?? 'no_placement');
  const [myArchetypeDex, setMyArchetypeDex] = useState<number[]>(initial?.my_archetype_dex ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && playedAt.length > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const body = { name: name.trim(), playedAt, category, bestOf, placement, myArchetypeDex };
      const res =
        props.mode === 'create'
          ? await fetch('/api/ptcg/tournaments', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/ptcg/tournaments/${props.tournament.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
      if (!res.ok) {
        const resBody = await res.json().catch(() => ({}));
        setError(resBody?.message ?? tCommon('errorUnknown'));
        return;
      }
      const { tournament } = (await res.json()) as { tournament: PtcgTournamentRow };
      props.onSaved(tournament);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      ariaLabel={props.mode === 'create' ? t('createTournamentTitle') : t('editTournamentTitle')}
      layout="bottom-sheet"
      className="bg-surface border-border flex w-full max-w-md flex-col gap-4 overflow-hidden rounded-xl border p-5"
    >
      <h2 className="text-base font-bold">
        {props.mode === 'create' ? t('createTournamentTitle') : t('editTournamentTitle')}
      </h2>

      <div>
        <label className="text-text-muted mb-2 block text-xs font-semibold tracking-wide uppercase">
          {t('tournamentNameLabel')}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('tournamentNamePlaceholder')}
          className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none"
        />
      </div>

      <div>
        <label className="text-text-muted mb-2 block text-xs font-semibold tracking-wide uppercase">
          {t('tournamentDateLabel')}
        </label>
        <input
          type="date"
          value={playedAt}
          onChange={(e) => setPlayedAt(e.target.value)}
          className="bg-surface-2 border-border focus:border-red w-full rounded-lg border px-3 py-2 text-sm outline-none"
        />
      </div>

      <div>
        <label className="text-text-muted mb-2 block text-xs font-semibold tracking-wide uppercase">
          {t('tournamentCategoryLabel')}
        </label>
        <CategorySelect value={category} onChange={setCategory} />
      </div>

      <div>
        <label className="text-text-muted mb-2 block text-xs font-semibold tracking-wide uppercase">
          {t('tournamentBestOfLabel')}
        </label>
        <div className="flex gap-2">
          {([1, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setBestOf(n)}
              aria-pressed={bestOf === n}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                bestOf === n ? 'bg-red border-red text-white' : 'border-border bg-surface-2'
              }`}
            >
              {t(n === 1 ? 'bestOf1' : 'bestOf3')}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-text-muted mb-2 block text-xs font-semibold tracking-wide uppercase">
          {t('tournamentPlacementLabel')}
        </label>
        <select
          value={placement}
          onChange={(e) => setPlacement(e.target.value as PtcgTournamentPlacement)}
          className="bg-surface-2 border-border w-full rounded-lg border px-3 py-2 text-sm"
        >
          {PLACEMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <DeckSlots label={t('myDeckLabel')} dex={myArchetypeDex} onChange={setMyArchetypeDex} />

      {error && <p className="text-red text-sm">{error}</p>}

      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={props.onClose}
          disabled={saving}
          className="border-border hover:bg-surface-2 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !canSave}
          className="bg-red rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? tCommon('saving') : tCommon('save')}
        </button>
      </div>
    </Modal>
  );
}
