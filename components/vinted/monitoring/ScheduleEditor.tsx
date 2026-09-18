'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VintedBotScheduleRow } from '@/lib/types';

const DAY_NAMES = Array.from({ length: 7 }, (_, i) =>
  new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(new Date(2026, 8, 20 + i)), // 2026-09-20 is a Sunday
);

interface Window {
  starts_at: string;
  ends_at: string;
}

function isWindowValid(w: Window): boolean {
  return w.starts_at < w.ends_at;
}

interface Props {
  userId: string;
  editable: boolean;
  schedule: Pick<VintedBotScheduleRow, 'day_of_week' | 'starts_at' | 'ends_at'>[];
  onSaved: () => void;
}

export default function ScheduleEditor({ userId, editable, schedule, onSaved }: Props) {
  const [draft, setDraft] = useState<Window[][]>(() => {
    const byDay: Window[][] = Array.from({ length: 7 }, () => []);
    for (const w of schedule) byDay[w.day_of_week].push({ starts_at: w.starts_at.slice(0, 5), ends_at: w.ends_at.slice(0, 5) });
    return byDay;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasInvalidWindow = draft.some((windows) => windows.some((w) => !isWindowValid(w)));

  function addWindow(day: number) {
    setDraft((prev) => prev.map((windows, i) => (i === day ? [...windows, { starts_at: '11:00', ends_at: '13:00' }] : windows)));
  }
  function removeWindow(day: number, index: number) {
    setDraft((prev) => prev.map((windows, i) => (i === day ? windows.filter((_, j) => j !== index) : windows)));
  }
  function updateWindow(day: number, index: number, field: keyof Window, value: string) {
    setDraft((prev) =>
      prev.map((windows, i) => (i === day ? windows.map((w, j) => (j === index ? { ...w, [field]: value } : w)) : windows)),
    );
  }

  async function save() {
    setError(null);
    if (hasInvalidWindow) {
      setError('Un créneau a une heure de fin antérieure ou égale à l’heure de début — corrige-le avant d’enregistrer.');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      const rows = draft.flatMap((windows, day) =>
        windows.map((w) => ({ user_id: userId, day_of_week: day, starts_at: `${w.starts_at}:00`, ends_at: `${w.ends_at}:00` })),
      );
      const { error: deleteError } = await supabase.from('vinted_bot_schedule').delete().eq('user_id', userId);
      if (deleteError) {
        console.error('ScheduleEditor save (delete) failed:', deleteError);
        setError('Échec de l’enregistrement — le planning précédent a été conservé côté serveur.');
        return;
      }
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('vinted_bot_schedule').insert(rows);
        if (insertError) {
          console.error('ScheduleEditor save (insert) failed:', insertError);
          setError('Échec de l’enregistrement — le planning a été effacé côté serveur, réessaie immédiatement.');
          return;
        }
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      {draft.map((windows, day) => (
        <div key={day} className="flex flex-wrap items-center gap-2">
          <span className="w-10 shrink-0 capitalize">{DAY_NAMES[day]}</span>
          {windows.map((w, i) => {
            const invalid = !isWindowValid(w);
            return (
              <span key={i} className="flex items-center gap-1">
                <input
                  type="time"
                  disabled={!editable}
                  value={w.starts_at}
                  onChange={(e) => updateWindow(day, i, 'starts_at', e.target.value)}
                  className={`bg-surface rounded border px-1 ${invalid ? 'border-red' : 'border-border'}`}
                />
                –
                <input
                  type="time"
                  disabled={!editable}
                  value={w.ends_at}
                  onChange={(e) => updateWindow(day, i, 'ends_at', e.target.value)}
                  className={`bg-surface rounded border px-1 ${invalid ? 'border-red' : 'border-border'}`}
                />
                {invalid && (
                  <span className="text-red text-xs" title="L’heure de fin doit être après l’heure de début.">
                    ⚠
                  </span>
                )}
                {editable && (
                  <button type="button" onClick={() => removeWindow(day, i)} className="text-red px-1">
                    ✕
                  </button>
                )}
              </span>
            );
          })}
          {editable && (
            <button type="button" onClick={() => addWindow(day)} className="text-text-muted text-xs">
              + créneau
            </button>
          )}
        </div>
      ))}
      {error && <span className="text-red">{error}</span>}
      {editable && (
        <button
          type="button"
          onClick={save}
          disabled={saving || hasInvalidWindow}
          className="bg-surface-2 border-border mt-1 w-fit rounded border px-3 py-1.5"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
    </div>
  );
}
