'use client';

import { useEffect, useState } from 'react';
import { ScrollText, Settings } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUserContext } from '@/lib/hooks/useUserContext';
import { nextScheduledWindowStart } from '@/lib/vinted/next-window';
import { fetchCardAnnonceTarget, fetchLotAnnonceTarget } from '@/lib/vinted/fetch-annonce-target';
import type { Card, CardListing, Lot } from '@/lib/types';
import type { VintedConfig } from '@/lib/utils/vinted-template';
import AnnonceModal from '@/components/vinted/AnnonceModal';
import LotAnnonceModal from '@/components/lots/LotAnnonceModal';
import { useMonitoringData } from './hooks/useMonitoringData';
import { useActiveJob } from './hooks/useActiveJob';
import StatusBar from './StatusBar';
import AlertBanner from './AlertBanner';
import ActiveJobBanner from './ActiveJobBanner';
import GroupedQueueGrid, { type PipelineItem } from './GroupedQueueGrid';
import GroupedRepostGrid, { type RepostPoolItem } from './GroupedRepostGrid';
import SettingsModal from './SettingsModal';
import LogsModal from './LogsModal';

type AnnonceTarget = { kind: 'card'; card: Card; listings: CardListing[] } | { kind: 'lot'; lot: Lot };

const DISCARD_CONFIRM_MESSAGE = 'Modifications non enregistrées — les abandonner ?';

export default function MonitoringSection() {
  const { myUserId, myName, partnerUserId, partnerName } = useUserContext();
  const [viewedUserId, setViewedUserId] = useState(myUserId);
  const data = useMonitoringData(viewedUserId);
  const { activeJob, pendingCount } = useActiveJob(viewedUserId);
  const editable = viewedUserId === myUserId;
  const [postingQueueId, setPostingQueueId] = useState<string | null>(null);
  const [repostingId, setRepostingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [vintedConfig, setVintedConfig] = useState<VintedConfig>({ vinted_shipping_note: '', vinted_seller_note: '' });
  const [annonceTarget, setAnnonceTarget] = useState<AnnonceTarget | null>(null);
  const [stagedPipeline, setStagedPipeline] = useState<PipelineItem[] | null>(null);
  const [stagedRepostCandidates, setStagedRepostCandidates] = useState<RepostPoolItem[] | null>(null);
  const [pendingPipelineIds, setPendingPipelineIds] = useState<Set<string>>(new Set());
  const [pendingRepostIds, setPendingRepostIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const isDirty = stagedPipeline !== null || stagedRepostCandidates !== null;

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('config')
      .select('*')
      .then(({ data: rows }) => {
        const map = Object.fromEntries(((rows ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
        setVintedConfig({
          vinted_shipping_note: map.vinted_shipping_note ?? '',
          vinted_seller_note: map.vinted_seller_note ?? '',
        });
      });
  }, []);

  // Warn before a page close/reload while a reorder hasn't been saved yet —
  // switching the Lui/Elle tab is handled separately by `switchUser` below
  // since that's an in-app navigation, not a page unload.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const storagePublicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}`;

  function switchUser(nextUserId: string) {
    if (isDirty && !window.confirm(DISCARD_CONFIRM_MESSAGE)) return;
    setStagedPipeline(null);
    setStagedRepostCandidates(null);
    setPendingPipelineIds(new Set());
    setPendingRepostIds(new Set());
    setViewedUserId(nextUserId);
  }

  function handleQueueReorder(items: PipelineItem[], movedId: string) {
    setStagedPipeline(items);
    setPendingPipelineIds((prev) => new Set(prev).add(movedId));
  }

  function handleRepostReorder(items: RepostPoolItem[], movedId: string) {
    setStagedRepostCandidates(items);
    setPendingRepostIds((prev) => new Set(prev).add(movedId));
  }

  async function viewListing(item: { cardId: string | null; lotId: string | null }) {
    const supabase = createClient();
    if (item.cardId) {
      const result = await fetchCardAnnonceTarget(supabase, item.cardId);
      if (result) setAnnonceTarget({ kind: 'card', ...result });
      return;
    }
    if (item.lotId) {
      const result = await fetchLotAnnonceTarget(supabase, item.lotId);
      if (result) setAnnonceTarget({ kind: 'lot', ...result });
    }
  }

  async function persistReorder(items: PipelineItem[]) {
    const supabase = createClient();
    await Promise.all(
      items.map((item, index) => supabase.from('vinted_queue').update({ position: index + 1 }).eq('id', item.queueId)),
    );
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
        // A direct post changes the underlying queue independently of
        // ordering — drop any pending local reorder rather than let it go
        // stale (it may reference an item that just left the queue). Await
        // the refetch before clearing the staged state so the grid doesn't
        // briefly snap back to the pre-edit order while data.pipeline still
        // holds stale data.
        await data.refetch();
        setStagedPipeline(null);
        setPendingPipelineIds(new Set());
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
        await data.refetch();
        setStagedRepostCandidates(null);
        setPendingRepostIds(new Set());
      }
    } finally {
      setRepostingId(null);
    }
  }

  async function saveChanges() {
    setSaving(true);
    try {
      if (stagedPipeline) await persistReorder(stagedPipeline);
      if (stagedRepostCandidates) await persistRepostReorder(stagedRepostCandidates);
      await data.refetch();
      setStagedPipeline(null);
      setStagedRepostCandidates(null);
      setPendingPipelineIds(new Set());
      setPendingRepostIds(new Set());
    } finally {
      setSaving(false);
    }
  }

  const nextPostAt = nextScheduledWindowStart(data.schedule, new Date());
  const presentGroups = Array.from(new Set(data.pipeline.map((item) => item.groupKey)));
  const visiblePipeline = stagedPipeline ?? data.pipeline;
  const visibleRepostCandidates = stagedRepostCandidates ?? data.repostCandidates;

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
            onSwitchUser={switchUser}
            todayJobCount={data.todayJobCount}
            dailyQuota={data.config.daily_quota}
            nextPostAt={nextPostAt}
          />
        </div>
        {isDirty && (
          <button
            type="button"
            onClick={saveChanges}
            disabled={saving}
            className="bg-red text-bg rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setLogsOpen(true)}
          aria-label="Logs"
          title="Logs"
          className="bg-surface-2 border-border rounded-lg border p-2"
        >
          <ScrollText className="h-4 w-4" aria-hidden />
        </button>
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
      <AlertBanner sessionStatus={data.sessionStatus} />
      <ActiveJobBanner activeJob={activeJob} pendingCount={pendingCount} />
      <GroupedQueueGrid
        items={visiblePipeline}
        dailyQuota={data.config.daily_quota}
        groupPriority={data.config.group_priority}
        editable={editable}
        onReorder={handleQueueReorder}
        onPostNow={postNow}
        postingQueueId={postingQueueId}
        onViewListing={viewListing}
        pendingIds={pendingPipelineIds}
        activeJobTarget={activeJob ? { cardId: activeJob.cardId, lotId: activeJob.lotId } : null}
      />
      <GroupedRepostGrid
        items={visibleRepostCandidates}
        active={visiblePipeline.length === 0}
        groupPriority={data.config.group_priority}
        editable={editable}
        onReorder={handleRepostReorder}
        onRepostNow={repostNow}
        repostingId={repostingId}
        onViewListing={viewListing}
        pendingIds={pendingRepostIds}
        activeJobTarget={activeJob ? { cardId: activeJob.cardId, lotId: activeJob.lotId } : null}
      />
      <LogsModal open={logsOpen} onClose={() => setLogsOpen(false)} logs={data.logs} />
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
      {annonceTarget?.kind === 'card' && (
        <AnnonceModal
          card={annonceTarget.card}
          config={vintedConfig}
          listings={annonceTarget.listings}
          myUserId={myUserId}
          partnerUserId={partnerUserId}
          partnerName={partnerName}
          onListingsChanged={data.refetch}
          onClose={() => setAnnonceTarget(null)}
          onPriceSaved={(cardId, newPrice) => {
            setAnnonceTarget((prev) =>
              prev && prev.kind === 'card' && prev.card.id === cardId
                ? { ...prev, card: { ...prev.card, suggested_price: newPrice } }
                : prev,
            );
            data.refetch();
          }}
          onCardRefreshed={(updated) => {
            setAnnonceTarget((prev) => (prev && prev.kind === 'card' ? { ...prev, card: updated } : prev));
          }}
        />
      )}
      {annonceTarget?.kind === 'lot' && (
        <LotAnnonceModal
          lot={annonceTarget.lot}
          storagePublicUrl={storagePublicUrl}
          onClose={() => setAnnonceTarget(null)}
          onPriceSaved={(lotId, newPrice) => {
            setAnnonceTarget((prev) =>
              prev && prev.kind === 'lot' && prev.lot.id === lotId ? { ...prev, lot: { ...prev.lot, price: newPrice } } : prev,
            );
            data.refetch();
          }}
          onLotDeleted={() => {
            setAnnonceTarget(null);
            data.refetch();
          }}
          onMovedToStock={() => {
            setAnnonceTarget(null);
            data.refetch();
          }}
        />
      )}
    </div>
  );
}
