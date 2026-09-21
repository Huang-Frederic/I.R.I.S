'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { nextScheduledWindowStart } from '@/lib/vinted/next-window';
import { useMonitoringData } from './hooks/useMonitoringData';
import StatusBar from './StatusBar';
import AlertBanner from './AlertBanner';
import QueuePipeline, { type PipelineItem } from './QueuePipeline';
import RepostPool from './RepostPool';
import BotConfigForm from './BotConfigForm';
import ScheduleEditor from './ScheduleEditor';
import CookiesForm from './CookiesForm';
import LogFeed from './LogFeed';

export default function MonitoringSection() {
  const { myUserId, myName, partnerUserId, partnerName } = useUserContext();
  const [viewedUserId, setViewedUserId] = useState(myUserId);
  const data = useMonitoringData(viewedUserId);
  const editable = viewedUserId === myUserId;
  const [postingQueueId, setPostingQueueId] = useState<string | null>(null);

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

  const nextPostAt = nextScheduledWindowStart(data.schedule, new Date());

  return (
    <div className="bg-surface border-border mb-6 flex flex-col gap-3 rounded-xl border p-4">
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
      <AlertBanner sessionStatus={data.sessionStatus} logs={data.logs} />
      <QueuePipeline
        items={data.pipeline}
        dailyQuota={data.config.daily_quota}
        editable={editable}
        onReorder={persistReorder}
        onPostNow={postNow}
        postingQueueId={postingQueueId}
      />
      <RepostPool items={data.repostCandidates} active={data.pipeline.length === 0} />
      <div className="border-border grid gap-4 border-t pt-3 md:grid-cols-2">
        <BotConfigForm
          key={viewedUserId}
          userId={viewedUserId}
          editable={editable}
          dailyQuota={data.config.daily_quota}
          repostAfterDays={data.config.repost_after_days}
          onSaved={data.refetch}
        />
        <CookiesForm userId={viewedUserId} onSaved={data.refetch} />
      </div>
      <ScheduleEditor
        key={viewedUserId}
        userId={viewedUserId}
        editable={editable}
        schedule={data.schedule}
        onSaved={data.refetch}
      />
      <div className="border-border border-t pt-3">
        <LogFeed logs={data.logs} />
      </div>
    </div>
  );
}
