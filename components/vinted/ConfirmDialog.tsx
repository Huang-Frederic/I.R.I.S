'use client';

import { X } from 'lucide-react';
import Modal from '@/components/ui/Modal';

interface Props {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  /** Visual style of the confirm button. */
  confirmTone?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export default function ConfirmDialog({
  title, body, confirmLabel, confirmTone = 'default', onConfirm, onCancel, busy = false,
}: Props) {
  const confirmClass = confirmTone === 'danger'
    ? 'bg-red text-bg hover:opacity-90'
    : 'bg-rarity-r/30 text-rarity-r border-rarity-r/50 border hover:bg-rarity-r/40';

  return (
    <Modal
      open={true}
      onClose={onCancel}
      ariaLabel={title}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      className="bg-surface border-border w-full max-w-sm rounded-lg border p-5 shadow-xl"
    >
      <div className="mb-3 flex items-start justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-text-muted hover:text-text disabled:opacity-50"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="text-text-muted mb-4 text-sm">{body}</div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="bg-surface-2 hover:bg-surface-off border-border rounded border px-3 py-1.5 text-xs disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={`rounded px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${confirmClass}`}
        >
          {busy ? 'Patientez…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
