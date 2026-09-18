'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  userId: string;
  editable: boolean;
  dailyQuota: number;
  repostAfterDays: number;
  onSaved: () => void;
}

export default function BotConfigForm({ userId, editable, dailyQuota, repostAfterDays, onSaved }: Props) {
  const [quotaDraft, setQuotaDraft] = useState(String(dailyQuota));
  const [repostDraft, setRepostDraft] = useState(String(repostAfterDays));
  const [saving, setSaving] = useState(false);

  async function save() {
    const quota = Number(quotaDraft);
    const repost = Number(repostDraft);
    if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(repost) || repost <= 0) return;

    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('vinted_bot_config')
        .upsert({ user_id: userId, daily_quota: quota, repost_after_days: repost, updated_at: new Date().toISOString() });
      if (error) {
        console.error('BotConfigForm save failed:', error);
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <label className="flex flex-col gap-1">
        Quota / jour
        <input
          type="number"
          min={1}
          disabled={!editable}
          value={quotaDraft}
          onChange={(e) => setQuotaDraft(e.target.value)}
          className="border-border bg-surface w-20 rounded border px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1">
        Repost après (jours)
        <input
          type="number"
          min={1}
          disabled={!editable}
          value={repostDraft}
          onChange={(e) => setRepostDraft(e.target.value)}
          className="border-border bg-surface w-20 rounded border px-2 py-1"
        />
      </label>
      {editable && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-surface-2 border-border rounded border px-3 py-1.5"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      )}
    </div>
  );
}
