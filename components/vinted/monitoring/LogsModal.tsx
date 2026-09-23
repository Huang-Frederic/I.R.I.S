'use client';

import type { VintedAgentLogRow } from '@/lib/types';
import Modal from '@/components/ui/Modal';
import LogFeed from './LogFeed';

interface Props {
  open: boolean;
  onClose: () => void;
  logs: VintedAgentLogRow[];
}

export default function LogsModal({ open, onClose, logs }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="Logs du bot Vinted"
      className="bg-surface border-border flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border p-6 shadow-xl"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Logs du bot</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="text-text-muted hover:text-text">
          ✕
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto">
        <LogFeed logs={logs} />
      </div>
    </Modal>
  );
}
