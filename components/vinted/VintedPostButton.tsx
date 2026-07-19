'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { X, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  cardId?: string;
  lotId?: string;
  userId: string;
  hasPrice: boolean;
  onListingsChanged: () => void;
}

export default function VintedPostButton({ cardId, lotId, userId, hasPrice, onListingsChanged }: Props) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'queued' | 'success' | 'error'>('idle');
  // Client-mount guard (avoids an SSR flash before the pending-job lookup runs).
  // useSyncExternalStore is the no-effect idiom: false on the server, true once
  // hydrated — no setState-in-effect.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLot = !!lotId;

  useEffect(() => {
    if (!hasPrice) return;
    let cancelled = false;
    const supabase = createClient();
    const jobQuery = supabase
      .from('vinted_post_jobs')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['pending', 'processing', 'error'])
      .limit(1);
    (isLot
      ? jobQuery.eq('lot_id', lotId!)
      : jobQuery.eq('card_id', cardId!)
    ).maybeSingle().then(async ({ data }) => {
      if (cancelled || !data) return;
      if (data.status === 'error') {
        await supabase.from('vinted_post_jobs').delete().eq('id', data.id);
        if (!cancelled) setState('idle');
      } else {
        setJobId(data.id);
        setState('queued');
      }
    });
    return () => { cancelled = true; };
  }, [cardId, lotId, userId, hasPrice, isLot]);

  useEffect(() => {
    if (state !== 'queued' || !jobId) return;
    const supabase = createClient();
    pollRef.current = setInterval(async () => {
      const { data: job } = await supabase
        .from('vinted_post_jobs')
        .select('status')
        .eq('id', jobId)
        .maybeSingle();
      if (!job) return;
      if (job.status === 'done') {
        clearInterval(pollRef.current!);
        const listingQuery = isLot
          ? supabase.from('lot_listings').select('vinted_listing_id').eq('lot_id', lotId!).eq('user_id', userId)
          : supabase.from('card_listings').select('vinted_listing_id').eq('card_id', cardId!).eq('user_id', userId);
        const { data: listing } = await listingQuery.maybeSingle();
        setListingId(listing?.vinted_listing_id ?? null);
        setState('success');
      } else if (job.status === 'error') {
        clearInterval(pollRef.current!);
        await supabase.from('vinted_post_jobs').delete().eq('id', jobId);
        setState('idle');
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [state, jobId, cardId, lotId, userId, isLot]);

  const handleClick = async () => {
    setState('loading');
    try {
      const body = isLot ? { lot_id: lotId } : { card_id: cardId };
      const res = await fetch('/api/vinted/post-job', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        const { job_id } = await res.json();
        setJobId(job_id);
        setState('queued');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  const handleSuccessClose = () => {
    setState('idle');
    setJobId(null);
    setListingId(null);
    onListingsChanged();
    router.refresh();
  };

  if (!mounted) return null;

  if (!hasPrice) {
    return (
      <span className="text-[10px] sm:text-xs text-text-faint" title="Définir un prix avant de poster">
        Prix manquant
      </span>
    );
  }

  if (state === 'success') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] sm:text-xs text-green-500 font-medium">✓ En ligne !</span>
        {listingId && (
          <a
            href={`https://www.vinted.fr/items/${listingId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] sm:text-xs text-green-500 underline inline-flex items-center gap-0.5"
          >
            Voir <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        <button type="button" onClick={handleSuccessClose} className="text-text-muted hover:text-text" aria-label="Fermer">
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  if (state === 'queued') return <span className="text-[10px] sm:text-xs text-yellow-500">En attente…</span>;
  if (state === 'error') return <span className="text-[10px] sm:text-xs text-red-500">Erreur</span>;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === 'loading'}
      className="shrink-0 inline-flex items-center gap-1.5 rounded bg-vinted px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 disabled:opacity-50 sm:px-3 sm:py-1.5 sm:text-xs"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/vinted-logo.jpeg" alt="" className="h-4 w-4 rounded object-cover" />
      {state === 'loading' ? '…' : 'Vinted'}
    </button>
  );
}
