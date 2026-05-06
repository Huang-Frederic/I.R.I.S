'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
      <span className="text-text-muted font-mono text-xs">
        {date} — {formatSize(sizeBytes)}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className="text-rarity-rr hover:underline disabled:opacity-60"
        >
          DL
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="text-red hover:underline disabled:opacity-60"
        >
          Suppr
        </button>
      </div>
    </li>
  );
}
