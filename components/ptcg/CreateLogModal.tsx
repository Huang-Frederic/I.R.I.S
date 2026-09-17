'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Modal from '@/components/ui/Modal';
import DeckSlots from './DeckSlots';

export interface ResolvedArchetype {
  me: string;
  opponent: string;
  myArchetypeDex: number[];
  opponentArchetypeDex: number[];
}

interface CreateProps {
  mode: 'create';
  open: boolean;
  onClose: () => void;
  /** Carried from the page's paste box, through the /resolve preview, to
   *  here — this is what Save actually persists. */
  raw: string;
  resolved: ResolvedArchetype;
  onSaved: (game: {
    id: string;
    played_at: string;
    result: 'win' | 'loss' | 'tie';
    myArchetypeDex: number[];
    opponentArchetypeDex: number[];
  }) => void;
}

interface EditProps {
  mode: 'edit';
  open: boolean;
  onClose: () => void;
  gameId: string;
  resolved: ResolvedArchetype;
  onSaved: (dex: { myArchetypeDex: number[]; opponentArchetypeDex: number[] }) => void;
}

type Props = CreateProps | EditProps;

export default function CreateLogModal(props: Props) {
  const t = useTranslations('ptcg');
  const tCommon = useTranslations('common');
  const [myDex, setMyDex] = useState(props.resolved.myArchetypeDex);
  const [opponentDex, setOpponentDex] = useState(props.resolved.opponentArchetypeDex);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (props.mode === 'create') {
        const res = await fetch('/api/ptcg/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            raw: props.raw,
            myArchetypeDex: myDex,
            opponentArchetypeDex: opponentDex,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.message ?? tCommon('errorUnknown'));
          return;
        }
        const { game } = (await res.json()) as {
          game: { id: string; played_at: string; result: 'win' | 'loss' | 'tie' };
        };
        // myDex/opponentDex here are whatever the user corrected them to in
        // this session, not props.resolved's original auto-detected values —
        // the caller must use these, or a freshly-added row shows the wrong
        // sprites until the page is reloaded and re-fetches from the DB.
        props.onSaved({ ...game, myArchetypeDex: myDex, opponentArchetypeDex: opponentDex });
      } else {
        const res = await fetch(`/api/ptcg/games/${props.gameId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ myArchetypeDex: myDex, opponentArchetypeDex: opponentDex }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.message ?? tCommon('errorUnknown'));
          return;
        }
        props.onSaved({ myArchetypeDex: myDex, opponentArchetypeDex: opponentDex });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      ariaLabel={props.mode === 'create' ? t('createLogTitle') : t('editLogTitle')}
      layout="bottom-sheet"
      className="bg-surface border-border flex w-full max-w-md flex-col gap-4 overflow-hidden rounded-xl border p-5"
    >
      <div>
        <h2 className="text-base font-bold">
          {props.mode === 'create' ? t('createLogTitle') : t('editLogTitle')}
        </h2>
        {props.mode === 'create' && <p className="text-text-muted text-sm">{t('createLogSubtitle')}</p>}
      </div>

      <DeckSlots label={t('myDeckLabel')} dex={myDex} onChange={setMyDex} />
      <DeckSlots label={t('opponentDeckLabel')} dex={opponentDex} onChange={setOpponentDex} />

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
          disabled={saving}
          className="bg-red rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? tCommon('saving') : tCommon('save')}
        </button>
      </div>
    </Modal>
  );
}
