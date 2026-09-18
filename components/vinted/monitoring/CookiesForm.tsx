'use client';

import { useState } from 'react';

interface Props {
  userId: string;
  onSaved: () => void;
}

export default function CookiesForm({ userId, onSaved }: Props) {
  const [raw, setRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    let cookies: unknown;
    try {
      cookies = JSON.parse(raw);
    } catch {
      setError('JSON invalide — colle exactement le contenu du fichier cookies_*.json.');
      return;
    }
    if (typeof cookies !== 'object' || cookies === null || Array.isArray(cookies)) {
      setError('Le JSON doit être un objet.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/vinted/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, cookies }),
      });
      if (!response.ok) {
        setError('Échec de l’enregistrement — vérifie que ce compte est bien activé pour Vinted.');
        return;
      }
      setRaw('');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder='{"access_token_web": "...", "refresh_token_web": "...", "datadome": "..."}'
        rows={3}
        className="border-border bg-surface w-full rounded border p-2 font-mono text-xs"
      />
      {error && <span className="text-red">{error}</span>}
      <button
        type="button"
        onClick={save}
        disabled={saving || raw.trim().length === 0}
        className="bg-surface-2 border-border w-fit rounded border px-3 py-1.5"
      >
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  );
}
