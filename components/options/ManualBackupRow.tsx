'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';

interface Props {
  name: string;
  createdAt: string;
  sizeBytes: number | null;
}

function formatSize(b: number | null): string {
  if (b == null) return '?';
  const mb = b / (1024 * 1024);
  return mb < 1 ? `${(b / 1024).toFixed(0)} Ko` : `${mb.toFixed(1)} Mo`;
}

export default function ManualBackupRow({ name, createdAt, sizeBytes }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/backup/manual/${name}`);
      const { signedUrl } = await res.json();
      if (signedUrl) window.location.href = signedUrl;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Supprimer ${name} ?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/backup/manual/${name}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const date = createdAt ? new Date(createdAt).toLocaleString('fr-FR') : '?';

  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <span className="text-text-muted font-mono text-xs" suppressHydrationWarning>
        {date} — {formatSize(sizeBytes)}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          aria-label={`Télécharger ${name}`}
          title="Télécharger"
          className="text-text-muted hover:text-rarity-rr hover:bg-surface-2 rounded-md p-1.5 transition-colors disabled:opacity-60"
        >
          <Download className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          aria-label={`Supprimer ${name}`}
          title="Supprimer"
          className="text-text-muted hover:text-red hover:bg-surface-2 rounded-md p-1.5 transition-colors disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
