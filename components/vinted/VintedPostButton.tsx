'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';

interface Props {
  cardId: string;
}

export default function VintedPostButton({ cardId }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'queued' | 'error'>('idle');

  const handleClick = async () => {
    setState('loading');
    try {
      const res = await fetch('/api/vinted/post-job', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ card_id: cardId }),
      });
      if (res.status === 201) {
        setState('queued');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  if (state === 'queued') {
    return <span className="text-[10px] sm:text-xs text-yellow-500">En attente…</span>;
  }
  if (state === 'error') {
    return <span className="text-[10px] sm:text-xs text-red-500">Erreur</span>;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'loading'}
      className="bg-surface-2 border-border inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] sm:text-xs disabled:opacity-50"
    >
      <Send className="h-3 w-3" />
      {state === 'loading' ? '…' : 'Vinted'}
    </button>
  );
}
