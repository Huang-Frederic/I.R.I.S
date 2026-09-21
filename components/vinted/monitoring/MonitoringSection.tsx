'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { nextScheduledWindowStart } from '@/lib/vinted/next-window';
import { useMonitoringData } from './hooks/useMonitoringData';
import StatusBar from './StatusBar';
import AlertBanner from './AlertBanner';
import GroupedQueueGrid, { type PipelineItem } from './GroupedQueueGrid';
import GroupedRepostGrid, { type RepostPoolItem } from './GroupedRepostGrid';
import SettingsModal from './SettingsModal';
import LogFeed from './LogFeed';

export default function MonitoringSection() {
  const { myUserId, myName, partnerUserId, partnerName } = useUserContext();
  const [viewedUserId, setViewedUserId] = useState(myUserId);
  const data = useMonitoringData(viewedUserId);
  const editable = viewedUserId === myUserId;
  const [postingQueueId, setPostingQueueId] = useState<string | null>(null);
  const [repostingId, setRepostingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  async function persistReorder(items: PipelineItem[]) {
    const supabase = createClient();
    await Promise.all(
      items.map((item, index) => supabase.from('vinted_queue').update({ position: index + 1 }).eq('id', item.queueId)),
    );
    data.refetch();
  }

  async function postNow(item: PipelineItem) {
    setPostingQueueId(item.queueId);
    try {
      const body = item.cardId ? { card_id: item.cardId } : { lot_id: item.lotId };
      const response = await fetch('/api/vinted/post-job', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        data.refetch();
      }
    } finally {
      setPostingQueueId(null);
    }
  }

  async function persistRepostReorder(items: RepostPoolItem[]) {
    const supabase = createClient();
    await Promise.all(
      items.map((item, index) => {
        const table = item.cardId ? 'card_listings' : 'lot_listings';
        const idColumn = item.cardId ? 'card_id' : 'lot_id';
        const idValue = (item.cardId ?? item.lotId) as string;
        return supabase.from(table).update({ repost_position: index + 1 }).eq(idColumn, idValue).eq('user_id', viewedUserId);
      }),
    );
    data.refetch();
  }

  async function repostNow(item: RepostPoolItem) {
    const id = (item.cardId ?? item.lotId) as string;
    setRepostingId(id);
    try {
      const body = item.cardId
        ? { card_id: item.cardId, job_type: 'repost' as const }
        : { lot_id: item.lotId, job_type: 'repost' as const };
      const response = await fetch('/api/vinted/post-job', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        data.refetch();
      }
    } finally {
      setRepostingId(null);
    }
  }

  const nextPostAt = nextScheduledWindowStart(data.schedule, new Date());
  const presentGroups = Array.from(new Set(data.pipeline.map((item) => item.groupKey)));

  return (
    <div className="bg-surface border-border mb-6 flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <StatusBar
            myName={myName}
            myUserId={myUserId}
            partnerName={partnerName}
            partnerUserId={partnerUserId}
            viewedUserId={viewedUserId}
            onSwitchUser={setViewedUserId}
            todayJobCount={data.todayJobCount}
            dailyQuota={data.config.daily_quota}
            nextPostAt={nextPostAt}
          />
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Paramètres"
          title="Paramètres"
          className="bg-surface-2 border-border rounded-lg border p-2"
        >
          <Settings className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <AlertBanner sessionStatus={data.sessionStatus} logs={data.logs} />
      <GroupedQueueGrid
        items={data.pipeline}
        dailyQuota={data.config.daily_quota}
        groupPriority={data.config.group_priority}
        editable={editable}
        onReorder={persistReorder}
        onPostNow={postNow}
        postingQueueId={postingQueueId}
      />
      <GroupedRepostGrid
        items={data.repostCandidates}
        active={data.pipeline.length === 0}
        groupPriority={data.config.group_priority}
        editable={editable}
        onReorder={persistRepostReorder}
        onRepostNow={repostNow}
        repostingId={repostingId}
      />
      <div className="border-border border-t pt-3">
        <LogFeed logs={data.logs} />
      </div>
      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userId={viewedUserId}
        editable={editable}
        dailyQuota={data.config.daily_quota}
        repostAfterDays={data.config.repost_after_days}
        schedule={data.schedule}
        groupPriority={data.config.group_priority}
        presentGroups={presentGroups}
        onSaved={data.refetch}
      />
    </div>
  );
}
