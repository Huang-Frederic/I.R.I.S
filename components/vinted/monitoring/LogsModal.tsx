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
      layout="fullscreen"
      className="bg-surface flex h-full w-full flex-col p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Logs du bot</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="text-text-muted hover:text-text">
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <LogFeed logs={logs} />
      </div>
    </Modal>
  );
}
